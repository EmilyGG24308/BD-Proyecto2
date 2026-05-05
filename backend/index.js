require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// Conexión
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));


// PRODUCTOS — CRUD completo
// ----------------------------------------------------------------------

// Listar productos
app.get('/api/productos', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.nombre, p.precio_unitario, p.stock, p.descripcion,
             c.nombre AS categoria, pr.nombre AS proveedor
      FROM producto p
      JOIN categoria c  ON p.categoria_id = c.id
      JOIN proveedor pr ON p.proveedor_id  = pr.id
      ORDER BY p.id
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear producto
app.post('/api/productos', async (req, res) => {
  const { categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion } = req.body;
  if (!nombre || !precio_unitario || stock === undefined)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  try {
    const [r] = await pool.query(
      `INSERT INTO producto (categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion]
    );
    res.status(201).json({ id: r.insertId, message: 'Producto creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Editar producto
app.put('/api/productos/:id', async (req, res) => {
  const { nombre, precio_unitario, stock, descripcion, categoria_id, proveedor_id } = req.body;
  try {
    await pool.query(
      `UPDATE producto SET nombre=?, precio_unitario=?, stock=?, descripcion=?,
       categoria_id=?, proveedor_id=? WHERE id=?`,
      [nombre, precio_unitario, stock, descripcion, categoria_id, proveedor_id, req.params.id]
    );
    res.json({ message: 'Producto actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar producto 
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const [usado] = await pool.query(
      `SELECT id FROM detalle_venta
       WHERE producto_id IN (SELECT id FROM producto WHERE id = ?)`,
      [req.params.id]
    );
    if (usado.length > 0)
      return res.status(400).json({ error: 'No se puede eliminar: tiene ventas asociadas' });
    await pool.query(`DELETE FROM producto WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Producto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CLIENTES — CRUD completo
// -------------------------------------------------------------------

app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM cliente ORDER BY apellido, nombre`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  if (!nombre || !apellido || !email || !telefono)
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  try {
    const [r] = await pool.query(
      `INSERT INTO cliente (nombre, apellido, email, telefono) VALUES (?, ?, ?, ?)`,
      [nombre, apellido, email, telefono]
    );
    res.status(201).json({ id: r.insertId, message: 'Cliente creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clientes/:id', async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  try {
    await pool.query(
      `UPDATE cliente SET nombre=?, apellido=?, email=?, telefono=? WHERE id=?`,
      [nombre, apellido, email, telefono, req.params.id]
    );
    res.json({ message: 'Cliente actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const [v] = await pool.query(`SELECT id FROM venta WHERE cliente_id = ?`, [req.params.id]);
    if (v.length > 0)
      return res.status(400).json({ error: 'No se puede eliminar: cliente tiene ventas' });
    await pool.query(`DELETE FROM cliente WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// VENTAS — Transacción explícita con ROLLBACK 
// ---------------------------------------------------------------------

app.get('/api/ventas', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.id, v.fecha, v.total,
             CONCAT(c.nombre,' ',c.apellido) AS cliente,
             CONCAT(e.nombre,' ',e.apellido) AS empleado
      FROM venta v
      JOIN cliente  c ON v.cliente_id  = c.id
      JOIN empleado e ON v.empleado_id = e.id
      ORDER BY v.fecha DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas', async (req, res) => {
  const { cliente_id, empleado_id, items } = req.body;
  if (!cliente_id || !empleado_id || !items || items.length === 0)
    return res.status(400).json({ error: 'Datos incompletos' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction(); // BEGIN

    let total = 0;
    const detalles = [];

    for (const item of items) {
      const [[prod]] = await conn.query(
        `SELECT id, precio_unitario, stock FROM producto WHERE id = ? FOR UPDATE`,
        [item.producto_id]
      );
      if (!prod)              throw new Error(`Producto ID ${item.producto_id} no existe`);
      if (prod.stock < item.cantidad) throw new Error(`Stock insuficiente para "${prod.id}"`);
      total += prod.precio_unitario * item.cantidad;
      detalles.push({ ...item, precio_unitario: prod.precio_unitario });
    }

    const [ventaRes] = await conn.query(
      `INSERT INTO venta (cliente_id, empleado_id, fecha, total) VALUES (?, ?, NOW(), ?)`,
      [cliente_id, empleado_id, total]
    );
    const venta_id = ventaRes.insertId;

    for (const d of detalles) {
      await conn.query(
        `INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario)
         VALUES (?, ?, ?, ?)`,
        [venta_id, d.producto_id, d.cantidad, d.precio_unitario]
      );
      await conn.query(
        `UPDATE producto SET stock = stock - ? WHERE id = ?`,
        [d.cantidad, d.producto_id]
      );
    }

    await conn.commit(); // COMMIT
    res.status(201).json({ venta_id, total, message: 'Venta registrada' });

  } catch (e) {
    await conn.rollback(); // ROLLBACK if fails
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});


// REPORTES
// ----------------------------------------------------------------------

// GROUP BY + HAVING 
app.get('/api/reportes/ventas-por-empleado', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT CONCAT(e.nombre,' ',e.apellido) AS empleado,
             COUNT(v.id)  AS total_ventas,
             SUM(v.total) AS monto_total,
             AVG(v.total) AS promedio_venta
      FROM empleado e
      JOIN venta v ON v.empleado_id = e.id
      GROUP BY e.id, e.nombre, e.apellido
      HAVING COUNT(v.id) >= 1
      ORDER BY monto_total DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Subquery en FROM 
app.get('/api/reportes/productos-mas-vendidos', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.nombre AS producto, cat.nombre AS categoria,
             r.total_cantidad, r.total_ingresos
      FROM (
        SELECT producto_id,
               SUM(cantidad) AS total_cantidad,
               SUM(subtotal) AS total_ingresos
        FROM detalle_venta
        GROUP BY producto_id
      ) AS r
      JOIN producto  p   ON r.producto_id  = p.id
      JOIN categoria cat ON p.categoria_id = cat.id
      ORDER BY r.total_cantidad DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// EXISTS 
app.get('/api/reportes/clientes-frecuentes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.nombre, c.apellido, c.email,
             COUNT(v.id) AS compras, SUM(v.total) AS total_gastado
      FROM cliente c
      JOIN venta v ON v.cliente_id = c.id
      WHERE EXISTS (
        SELECT 1 FROM venta v2 WHERE v2.cliente_id = c.id
      )
      GROUP BY c.id
      ORDER BY total_gastado DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CTE (WITH) 
app.get('/api/reportes/ventas-mensuales', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      WITH ventas_mensuales AS (
        SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
               COUNT(id)  AS num_ventas,
               SUM(total) AS total_mes,
               AVG(total) AS promedio
        FROM venta
        GROUP BY DATE_FORMAT(fecha, '%Y-%m')
      )
      SELECT mes, num_ventas, total_mes, promedio
      FROM ventas_mensuales
      ORDER BY mes DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VIEW 
app.get('/api/reportes/detalle-ventas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM vista_ventas_detalle ORDER BY fecha DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// DATOS AUXILIARES
// ----------------------------------------------------------------------
app.get('/api/categorias', async (req, res) => {
  try { const [r] = await pool.query(`SELECT * FROM categoria`); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/proveedores', async (req, res) => {
  try { const [r] = await pool.query(`SELECT * FROM proveedor`); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/empleados', async (req, res) => {
  try { const [r] = await pool.query(`SELECT * FROM empleado`); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Exportar CSV 
app.get('/api/exportar/ventas-csv', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM vista_ventas_detalle ORDER BY fecha DESC`);
    if (!rows.length) return res.send('Sin datos');
    const headers = Object.keys(rows[0]).join(',');
    const csv     = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Arrancar 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running en puerto ${PORT}`));