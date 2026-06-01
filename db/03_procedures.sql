USE tienda_db;
DELIMITER $$

--venta
CREATE PROCEDURE registrar_venta(
    IN  p_cliente_id  INT,
    IN  p_empleado_id INT,
    IN  p_items       JSON,
    OUT p_venta_id    INT,
    OUT p_total       DECIMAL(10,2),
    OUT p_error       VARCHAR(255)
)
BEGIN
    DECLARE v_i        INT DEFAULT 0;
    DECLARE v_len      INT;
    DECLARE v_pid      INT;
    DECLARE v_qty      INT;
    DECLARE v_precio   DECIMAL(10,2);
    DECLARE v_stock    INT;
    DECLARE v_subtotal DECIMAL(10,2) DEFAULT 0;

    DECLARE exit handler FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_error    = 'Error interno al registrar la venta';
        SET p_venta_id = NULL;
        SET p_total    = NULL;
    END;

    SET p_error = NULL;
    SET v_len   = JSON_LENGTH(p_items);
    START TRANSACTION;

    WHILE v_i < v_len DO
        SET v_pid = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[',v_i,'].producto_id')));
        SET v_qty = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[',v_i,'].cantidad')));

        SELECT precio_unitario, stock INTO v_precio, v_stock
        FROM producto WHERE id = v_pid FOR UPDATE;

        IF v_stock < v_qty THEN
            SET p_error = CONCAT('Stock insuficiente: producto ', v_pid);
            ROLLBACK;
            LEAVE BEGIN;
        END IF;

        SET v_subtotal = v_subtotal + (v_precio * v_qty);
        SET v_i = v_i + 1;
    END WHILE;

    INSERT INTO venta (cliente_id, empleado_id, fecha, total)
    VALUES (p_cliente_id, p_empleado_id, NOW(), v_subtotal);
    SET p_venta_id = LAST_INSERT_ID();
    SET p_total    = v_subtotal;

    SET v_i = 0;
    WHILE v_i < v_len DO
        SET v_pid = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[',v_i,'].producto_id')));
        SET v_qty = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[',v_i,'].cantidad')));
        SELECT precio_unitario INTO v_precio FROM producto WHERE id = v_pid;

        INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario)
        VALUES (p_venta_id, v_pid, v_qty, v_precio);
        UPDATE producto SET stock = stock - v_qty WHERE id = v_pid;
        SET v_i = v_i + 1;
    END WHILE;

    COMMIT;
END$$

-- create product
CREATE PROCEDURE crear_producto(
    IN  p_categoria_id INT,
    IN  p_proveedor_id INT,
    IN  p_nombre       VARCHAR(150),
    IN  p_precio       DECIMAL(10,2),
    IN  p_stock        INT,
    IN  p_descripcion  TEXT,
    OUT p_nuevo_id     INT,
    OUT p_error        VARCHAR(255)
)
BEGIN
    DECLARE exit handler FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_error    = 'Error al crear el producto';
        SET p_nuevo_id = NULL;
    END;

    SET p_error = NULL;
    IF p_precio <= 0 THEN
        SET p_error = 'El precio debe ser mayor a 0';
        LEAVE BEGIN;
    END IF;
    IF p_stock < 0 THEN
        SET p_error = 'El stock no puede ser negativo';
        LEAVE BEGIN;
    END IF;

    START TRANSACTION;
    INSERT INTO producto (categoria_id, proveedor_id, nombre, precio_unitario, stock, descripcion)
    VALUES (p_categoria_id, p_proveedor_id, p_nombre, p_precio, p_stock, p_descripcion);
    SET p_nuevo_id = LAST_INSERT_ID();
    COMMIT;
END$$

-- actualizar
CREATE PROCEDURE actualizar_stock(
    IN  p_producto_id INT,
    IN  p_nuevo_stock INT,
    OUT p_error       VARCHAR(255)
)
BEGIN
    DECLARE v_existe INT DEFAULT 0;
    DECLARE exit handler FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_error = 'Error al actualizar stock';
    END;

    SET p_error = NULL;
    SELECT COUNT(*) INTO v_existe FROM producto WHERE id = p_producto_id;
    IF v_existe = 0 THEN
        SET p_error = 'Producto no encontrado';
        LEAVE BEGIN;
    END IF;
    IF p_nuevo_stock < 0 THEN
        SET p_error = 'El stock no puede ser negativo';
        LEAVE BEGIN;
    END IF;

    START TRANSACTION;
    UPDATE producto SET stock = p_nuevo_stock WHERE id = p_producto_id;
    COMMIT;
END$$

--crear cliente
CREATE PROCEDURE crear_cliente(
    IN  p_nombre    VARCHAR(100),
    IN  p_apellido  VARCHAR(100),
    IN  p_email     VARCHAR(150),
    IN  p_telefono  VARCHAR(20),
    OUT p_nuevo_id  INT,
    OUT p_error     VARCHAR(255)
)
BEGIN
    DECLARE v_existe INT DEFAULT 0;
    DECLARE exit handler FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_error    = 'Error al crear el cliente';
        SET p_nuevo_id = NULL;
    END;

    SET p_error = NULL;
    SELECT COUNT(*) INTO v_existe FROM cliente WHERE email = p_email;
    IF v_existe > 0 THEN
        SET p_error = 'Ya existe un cliente con ese email';
        LEAVE BEGIN;
    END IF;

    START TRANSACTION;
    INSERT INTO cliente (nombre, apellido, email, telefono)
    VALUES (p_nombre, p_apellido, p_email, p_telefono);
    SET p_nuevo_id = LAST_INSERT_ID();
    COMMIT;
END$$

-- eliminar producto
CREATE PROCEDURE eliminar_producto(
    IN  p_producto_id INT,
    OUT p_error       VARCHAR(255)
)
BEGIN
    DECLARE v_ventas INT DEFAULT 0;
    DECLARE exit handler FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_error = 'Error al eliminar el producto';
    END;

    SET p_error = NULL;
    SELECT COUNT(*) INTO v_ventas FROM detalle_venta WHERE producto_id = p_producto_id;
    IF v_ventas > 0 THEN
        SET p_error = 'Producto con ventas registradas, no se puede eliminar';
        LEAVE BEGIN;
    END IF;

    START TRANSACTION;
    DELETE FROM producto WHERE id = p_producto_id;
    COMMIT;
END$$

DELIMITER ;