-- =====================================================
-- ESQUEMA COMPLETO ERP COMERCIAL CAMADU C.A. (PostgreSQL 18)
-- Compatible con pgAdmin 4
-- =====================================================

-- 1. Tabla de Proveedores (Módulo 5: Directorio Centralizado)
CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre_empresa VARCHAR(150) NOT NULL,
  nombre_contacto VARCHAR(120),
  telefono VARCHAR(50),
  email VARCHAR(120),
  direccion TEXT,
  condiciones_pago VARCHAR(150),
  dias_credito INT DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Productos e Inventario (Módulo 1: Control de Inventario y Stock)
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  material VARCHAR(100),
  stock_actual INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 5,
  precio_costo NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  precio_venta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Entradas y Salidas / Trazabilidad (Módulo 2: Flujo Físico)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id SERIAL PRIMARY KEY,
  producto_id INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  tipo VARCHAR(10) NOT NULL CHECK(tipo IN ('ENTRADA', 'SALIDA')),
  motivo VARCHAR(50) NOT NULL, -- 'COMPRA', 'VENTA', 'MERMA', 'DEVOLUCION', 'AJUSTE'
  cantidad INT NOT NULL,
  numero_documento VARCHAR(80), -- Factura de compra, remisión, factura de venta
  responsable VARCHAR(120) NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  nota TEXT
);

-- 4. Tabla de Cuentas por Pagar (Módulo 3: Control Financiero de Deudas)
CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id SERIAL PRIMARY KEY,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  numero_factura VARCHAR(80) NOT NULL,
  monto_total NUMERIC(12, 2) NOT NULL,
  monto_pagado NUMERIC(12, 2) DEFAULT 0.00,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  estatus VARCHAR(20) DEFAULT 'PENDIENTE' CHECK(estatus IN ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  notas TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Historial de Pagos y Abonos (Módulo 3)
CREATE TABLE IF NOT EXISTS pagos_cuentas (
  id SERIAL PRIMARY KEY,
  cuenta_id INT NOT NULL REFERENCES cuentas_por_pagar(id) ON DELETE CASCADE,
  monto NUMERIC(12, 2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL, -- 'TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO_USD', 'DIVISAS'
  referencia VARCHAR(100),
  fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Usuarios y Seguridad (Módulo 6: Administración de Usuarios)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  username VARCHAR(60) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL DEFAULT 'OPERADOR', -- 'ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'CAJERO'
  email VARCHAR(120),
  telefono VARCHAR(50),
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Configuración Global del Sistema (Tasa de Cambio BCV, Empresa, etc.)
CREATE TABLE IF NOT EXISTS configuracion (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(80) UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descripcion TEXT,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices recomendados para optimización en PostgreSQL
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha_tipo ON movimientos_inventario(fecha, tipo);
CREATE INDEX IF NOT EXISTS idx_cxp_vencimiento_estatus ON cuentas_por_pagar(fecha_vencimiento, estatus);
CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
