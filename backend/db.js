const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configurar parser para que columnas NUMERIC / DECIMAL (OID 1700) se devuelvan como float en JavaScript
types.setTypeParser(1700, val => (val === null ? 0 : parseFloat(val)));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'camadu_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'deivy123.',
});

// Prueba de conexión e inicialización de semillas si está vacía
async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log(' Conectado exitosamente a PostgreSQL (Base de datos: ' + (process.env.DB_NAME || 'camadu_db') + ')');

    // 1. Cargar y ejecutar automáticamente el esquema DDL si las tablas no existen
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema_postgres.sql'), 'utf8');
    await client.query(schemaSql);

    // 2. Sembrar configuración base si no existe
    await client.query(`
      INSERT INTO configuracion (clave, valor, descripcion)
      VALUES 
        ('tasa_dolar', '48.50', 'Tasa oficial de cambio USD a Bolívares (VES)'),
        ('nombre_empresa', 'Comercial Camadu C.A.', 'Razón social de la empresa'),
        ('lema', 'Distribución y Comercio', 'Slogan comercial')
      ON CONFLICT (clave) DO NOTHING;

      UPDATE configuracion SET valor = 'Comercial Camadu C.A.' WHERE clave = 'nombre_empresa' AND valor = 'Heladería Camadu C.A.';
      UPDATE configuracion SET valor = 'Distribución y Comercio' WHERE clave = 'lema' AND valor = '¡Un helado, una sonrisa!';
    `);

    // Sembrar usuarios si no hay ninguno o actualizar a los nuevos roles VENDEDOR y CAJERO
    const uRes = await client.query('SELECT COUNT(*) as count FROM usuarios');
    if (parseInt(uRes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO usuarios (nombre_completo, username, password, rol, email, telefono, activo)
        VALUES 
          ('Herlin Aquino', 'herlin', 'admin123', 'ADMINISTRADOR', 'herlin@camadu.com', '+58 412-1112233', true),
          ('Deivy González', 'deivy', 'admin123', 'ADMINISTRADOR', 'deivy@camadu.com', '+58 414-9998877', true),
          ('Carlos Méndez', 'vendedor1', '1234', 'VENDEDOR', 'ventas@camadu.com', '+58 412-3334455', true),
          ('Mariana Rivas', 'cajero1', '1234', 'CAJERO', 'caja@camadu.com', '+58 424-5556677', true),
          ('Supervisor Almacén', 'supervisor1', 'admin123', 'SUPERVISOR', 'supervisor@camadu.com', '+58 416-8889900', true)
      `);
      console.log('👥 Usuarios iniciales sembrados en PostgreSQL.');
    } else {
      // Garantizar que existan usuarios para los roles VENDEDOR y CAJERO (sin acceso a proveedores)
      await client.query(`
        INSERT INTO usuarios (nombre_completo, username, password, rol, email, telefono, activo)
        VALUES 
          ('Carlos Méndez', 'vendedor1', '1234', 'VENDEDOR', 'ventas@camadu.com', '+58 412-3334455', true)
        ON CONFLICT (username) DO UPDATE SET rol = 'VENDEDOR';

        UPDATE usuarios 
        SET rol = 'CAJERO', nombre_completo = 'Mariana Rivas (Caja)'
        WHERE username = 'cajero1';
      `);
    }

    // Verificar si hay productos, si no hay, sembrar datos de demostración
    const res = await client.query('SELECT COUNT(*) as count FROM productos');
    if (parseInt(res.rows[0].count, 10) === 0) {
      console.log(' Sembrando datos iniciales en PostgreSQL...');
      await seedDemoData(client);
      console.log(' Datos de prueba sembrados correctamente.');
    }

    client.release();
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
  }
}

async function seedDemoData(client) {
  // 1. Proveedores
  const prov1 = await client.query(`
    INSERT INTO proveedores (nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, ['Distribuidora Herrajes Metálicos C.A.', 'Carlos Mendoza', '+58 412-5551234', 'ventas@herrajesmetalicos.com', 'Zona Industrial La Yaguara, Calle 3, Galpón 12, Caracas', 'Crédito a 30 días', 30]);

  const prov2 = await client.query(`
    INSERT INTO proveedores (nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, ['Importadora Manicería y Accesorios El Roble', 'Mariana Silva', '+58 414-8889900', 'contacto@elrobleaccesorios.com', 'Av. Sucre, Catia, Edf. Industrial Piso 2, Caracas', 'Contado contra entrega', 0]);

  const prov3 = await client.query(`
    INSERT INTO proveedores (nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, ['Inversiones Acero Inox & Bronce S.A.', 'Jesús Ramírez', '+58 424-3334411', 'jramirez@aceroinox.ve', 'Boleíta Norte, Transversal 4, Caracas', 'Crédito a 15 días', 15]);

  // 2. Productos
  const p1 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-001', 'Broche de Presión 15mm', 'Broche metálico para marroquinería y prendas', 'Acero Niquelado', 18, 50, 0.25, 0.60]);

  const p2 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-002', 'Hebilla Redonda Dorada 25mm', 'Hebilla fina para carteras y cinturones', 'Latón Brillante', 120, 30, 0.80, 1.75]);

  const p3 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-003', 'Remache Doble Cabeza 9mm', 'Remache para refuerzo en cuero y lona', 'Hierro Cobrizado', 350, 100, 0.05, 0.15]);

  const p4 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-004', 'Argolla Soldada D-Ring 20mm', 'Argolla en D reforzada para bolsos', 'Acero Inoxidable', 12, 40, 0.40, 0.95]);

  const p5 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-005', 'Ojal con Arandela #3', 'Ojalillo metálico para lonas y calzado', 'Aluminio Anodizado', 500, 150, 0.03, 0.10]);

  const p6 = await client.query(`
    INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, ['MC-006', 'Mosquetón Giratorio 30mm', 'Mosquetón de alta resistencia para correas', 'Zamak Cromado', 8, 25, 1.10, 2.50]);

  // 3. Cuentas por Pagar
  await client.query(`
    INSERT INTO cuentas_por_pagar (proveedor_id, numero_factura, monto_total, monto_pagado, fecha_emision, fecha_vencimiento, estatus, notas)
    VALUES 
    ($1, 'FACT-2026-0041', 450.00, 150.00, '2026-10-10', '2026-11-10', 'PARCIAL', 'Abono inicial de 33%'),
    ($2, 'FACT-2026-0089', 320.00, 0.00, '2026-10-20', '2026-11-05', 'PENDIENTE', 'Factura por reposición de hebillas y remaches'),
    ($3, 'FACT-2026-0012', 180.00, 180.00, '2026-09-15', '2026-10-01', 'PAGADA', 'Cancelado en su totalidad')
  `, [prov1.rows[0].id, prov2.rows[0].id, prov3.rows[0].id]);

  // 4. Movimientos de inventario (Entradas y Salidas)
  await client.query(`
    INSERT INTO movimientos_inventario (producto_id, tipo, motivo, cantidad, numero_documento, responsable, fecha, nota)
    VALUES 
    ($1, 'ENTRADA', 'COMPRA', 100, 'FAC-0041', 'Herlin Aquino', NOW() - INTERVAL '15 days', 'Ingreso inicial por compra'),
    ($2, 'ENTRADA', 'COMPRA', 200, 'FAC-0041', 'Herlin Aquino', NOW() - INTERVAL '15 days', 'Ingreso inicial por compra'),
    ($3, 'ENTRADA', 'COMPRA', 500, 'FAC-0089', 'Deivy González', NOW() - INTERVAL '10 days', 'Caja de 500 remaches'),
    ($3, 'SALIDA', 'VENTA', 150, 'TICKET-101', 'Deivy González', NOW() - INTERVAL '5 days', 'Despacho cliente mayorista'),
    ($1, 'SALIDA', 'VENTA', 82, 'TICKET-102', 'Herlin Aquino', NOW() - INTERVAL '3 days', 'Venta al mostrador'),
    ($2, 'SALIDA', 'VENTA', 80, 'TICKET-103', 'Herlin Aquino', NOW() - INTERVAL '2 days', 'Despacho taller de calzado'),
    ($4, 'SALIDA', 'VENTA', 17, 'TICKET-104', 'Deivy González', NOW() - INTERVAL '1 days', 'Venta directa')
  `, [p1.rows[0].id, p2.rows[0].id, p3.rows[0].id, p6.rows[0].id]);
}

initDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
