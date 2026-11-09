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

    let cleanUser = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    // Normalizar alias comunes a su usuario correspondiente
    const aliases = {
      'herlin': 'admin',
      'administrador': 'admin',
      'vendedor1': 'vendedor',
      'cajero1': 'cajero',
      'supervisor1': 'supervisor'
    };
    if (aliases[cleanUser]) {
      cleanUser = aliases[cleanUser];
    }

    const { rows } = await db.query(`
      SELECT id, nombre_completo, username, password, rol, email, telefono, activo 
      FROM usuarios 
      WHERE LOWER(username) = $1
    `, [cleanUser]);

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

module.exports = app;
