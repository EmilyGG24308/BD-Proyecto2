require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const { Producto, Cliente, AppUser } = require('./models');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'tienda_dev_key',
  resave:            false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
}));

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// middleware


function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ error: 'No autenticado' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user)
      return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.session.user.role))
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    next();
  };
}


// auth routs


app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Credenciales requeridas' });
  try {
    const user = await AppUser.findOne({ where: { username, activo: 1 } });
    if (!user)
      return res.status(401).json({ error: 'Usuario no encontrado' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ username: user.username, role: user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Sesión cerrada' }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'No autenticado' });
  res.json(req.session.user);
});

// productos

app.get('/api/productos', requireAuth, async (req, res) => {
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

app.post('/api/productos', requireRole('admin','gerente'), async (req, res) => {
  const { categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion } = req.body;
  if (!nombre || !precio_unitario || stock === undefined)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'CALL crear_producto(?,?,?,?,?,?,@nid,@err)',
      [categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion || '']
    );
    const [[out]] = await conn.query('SELECT @nid AS id, @err AS error');
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json({ id: out.id, message: 'Producto creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});

app.put('/api/productos/:id', requireRole('admin','gerente'), async (req, res) => {
  const { nombre, precio_unitario, stock, descripcion, categoria_id, proveedor_id } = req.body;
  try {
    await Producto.update(
      { nombre, precio_unitario, stock, descripcion, categoria_id, proveedor_id },
      { where: { id: req.params.id } }
    );
    res.json({ message: 'Producto actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/productos/:id', requireRole('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL eliminar_producto(?,@err)', [req.params.id]);
    const [[out]] = await conn.query('SELECT @err AS error');
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ message: 'Producto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});

app.patch('/api/productos/:id/stock', requireRole('admin','gerente','bodeguero'), async (req, res) => {
  const { stock } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL actualizar_stock(?,?,@err)', [req.params.id, stock]);
    const [[out]] = await conn.query('SELECT @err AS error');
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ message: 'Stock actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});


// clientes

app.get('/api/clientes', requireAuth, async (req, res) => {
  try {
    const rows = await Cliente.findAll({ order: [['apellido','ASC'],['nombre','ASC']] });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', requireRole('admin','gerente','cajero'), async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  if (!nombre || !apellido || !email || !telefono)
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'CALL crear_cliente(?,?,?,?,@nid,@err)',
      [nombre, apellido, email, telefono]
    );
    const [[out]] = await conn.query('SELECT @nid AS id, @err AS error');
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json({ id: out.id, message: 'Cliente creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});

app.put('/api/clientes/:id', requireRole('admin','gerente','cajero'), async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  try {
    await Cliente.update(
      { nombre, apellido, email, telefono },
      { where: { id: req.params.id } }
    );
    res.json({ message: 'Cliente actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clientes/:id', requireRole('admin'), async (req, res) => {
  try {
    const [v] = await pool.query('SELECT id FROM venta WHERE cliente_id = ?', [req.params.id]);
    if (v.length > 0)
      return res.status(400).json({ error: 'No se puede eliminar: cliente tiene ventas' });
    await Cliente.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Cliente eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ventas y reportes

app.get('/api/ventas', requireRole('admin','gerente','vendedor','cajero'), async (req, res) => {
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

app.post('/api/ventas', requireRole('admin','gerente','vendedor'), async (req, res) => {
  const { cliente_id, empleado_id, items } = req.body;
  if (!cliente_id || !empleado_id || !items?.length)
    return res.status(400).json({ error: 'Datos incompletos' });
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'CALL registrar_venta(?,?,?,@vid,@total,@err)',
      [cliente_id, empleado_id, JSON.stringify(items)]
    );
    const [[out]] = await conn.query('SELECT @vid AS venta_id, @total AS total, @err AS error');
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json({ venta_id: out.venta_id, total: out.total, message: 'Venta registrada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});


// reports


app.get('/api/reportes/ventas-por-empleado', requireRole('admin','gerente'), async (req, res) => {
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

app.get('/api/reportes/productos-mas-vendidos', requireRole('admin','gerente'), async (req, res) => {
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

app.get('/api/reportes/clientes-frecuentes', requireRole('admin','gerente'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.nombre, c.apellido, c.email,
             COUNT(v.id) AS compras, SUM(v.total) AS total_gastado
      FROM cliente c
      JOIN venta v ON v.cliente_id = c.id
      WHERE EXISTS (SELECT 1 FROM venta v2 WHERE v2.cliente_id = c.id)
      GROUP BY c.id
      ORDER BY total_gastado DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/ventas-mensuales', requireRole('admin','gerente'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      WITH ventas_mensuales AS (
        SELECT DATE_FORMAT(fecha,'%Y-%m') AS mes,
               COUNT(id)  AS num_ventas,
               SUM(total) AS total_mes,
               AVG(total) AS promedio
        FROM venta
        GROUP BY DATE_FORMAT(fecha,'%Y-%m')
      )
      SELECT mes, num_ventas, total_mes, promedio
      FROM ventas_mensuales
      ORDER BY mes DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/detalle-ventas', requireRole('admin','gerente'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM vista_ventas_detalle ORDER BY fecha DESC LIMIT 50'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// dts auxiliares


app.get('/api/categorias', requireAuth, async (req, res) => {
  try { const [r] = await pool.query('SELECT * FROM categoria'); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/proveedores', requireAuth, async (req, res) => {
  try { const [r] = await pool.query('SELECT * FROM proveedor'); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/empleados', requireAuth, async (req, res) => {
  try { const [r] = await pool.query('SELECT * FROM empleado'); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/exportar/ventas-csv', requireRole('admin','gerente'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vista_ventas_detalle ORDER BY fecha DESC');
    if (!rows.length) return res.send('Sin datos');
    const headers = Object.keys(rows[0]).join(',');
    const csv     = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));