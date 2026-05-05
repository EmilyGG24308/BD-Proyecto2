CREATE DATABASE IF NOT EXISTS tienda_db;
USE tienda_db;

CREATE TABLE IF NOT EXISTS categoria (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS proveedor (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    telefono VARCHAR(20)  NOT NULL,
    email    VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS producto (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id    INT           NOT NULL,
    proveedor_id    INT           NOT NULL,
    nombre          VARCHAR(150)  NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    stock           INT           NOT NULL DEFAULT 0,
    descripcion     TEXT,
    FOREIGN KEY (categoria_id) REFERENCES categoria(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedor(id)
);

CREATE TABLE IF NOT EXISTS cliente (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email    VARCHAR(150) NOT NULL,
    telefono VARCHAR(20)  NOT NULL
);

CREATE TABLE IF NOT EXISTS empleado (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    apellido       VARCHAR(100) NOT NULL,
    puesto         VARCHAR(100) NOT NULL,
    fecha_contrato DATE         NOT NULL
);

CREATE TABLE IF NOT EXISTS venta (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id  INT           NOT NULL,
    empleado_id INT           NOT NULL,
    fecha       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total       DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (cliente_id)  REFERENCES cliente(id),
    FOREIGN KEY (empleado_id) REFERENCES empleado(id)
);

CREATE TABLE IF NOT EXISTS detalle_venta (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    venta_id        INT           NOT NULL,
    producto_id     INT           NOT NULL,
    cantidad        INT           NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal        DECIMAL(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
    FOREIGN KEY (venta_id)    REFERENCES venta(id),
    FOREIGN KEY (producto_id) REFERENCES producto(id)
);

-- ÍNDICES (justificados: son columnas que se usan en búsquedas y JOINs frecuentes)
CREATE INDEX idx_producto_categoria ON producto(categoria_id);
CREATE INDEX idx_producto_proveedor  ON producto(proveedor_id);
CREATE INDEX idx_venta_cliente       ON venta(cliente_id);
CREATE INDEX idx_venta_fecha         ON venta(fecha);

-- VIEW usado por el backend para reportes
CREATE OR REPLACE VIEW vista_ventas_detalle AS
SELECT
    v.id   AS venta_id,
    v.fecha,
    v.total,
    CONCAT(c.nombre, ' ', c.apellido) AS cliente,
    CONCAT(e.nombre, ' ', e.apellido) AS empleado,
    p.nombre  AS producto,
    dv.cantidad,
    dv.precio_unitario,
    dv.subtotal
FROM venta v
JOIN cliente       c  ON v.cliente_id   = c.id
JOIN empleado      e  ON v.empleado_id  = e.id
JOIN detalle_venta dv ON dv.venta_id    = v.id
JOIN producto      p  ON dv.producto_id = p.id;

