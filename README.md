# 🏢 Comercial Camadu C.A. - Sistema de Gerencia y Planificación ERP

> Prototipo Operativo de Sistema de Gestión Empresarial desarrollado como Trabajo Especial de Grado para optar al Título de Ingeniero en Informática en la **Universidad Alejandro de Humboldt (UAH)**.

---

## 📋 Información Académica
* **Autora:** Herlin Korina Aquino
* **Tutora:** MSc. Ofelia Sánchez
* **Institución:** Universidad Alejandro de Humboldt (UAH)
* **Facultad:** Ingeniería en Informática
* **Fecha:** Caracas, Noviembre de 2026

---

## 🚀 Características Principales
1. **📊 Dashboard General:** Indicadores KPIs en tiempo real (total productos, stock crítico, deuda total de cuentas por pagar, salidas del mes) y tabla de alertas de reabastecimiento urgente.
2. **📦 Módulo 1 (Control de Inventario y Stock):** Catálogo de productos con umbral de stock mínimo, búsqueda reactiva y precios en Dólares ($) y Bolívares (Bs.).
3. **🔄 Módulo 2 (Entradas y Salidas de Almacén):** Trazabilidad física de compras, ventas, devoluciones, mermas y ajustes con transacciones atómicas seguras (`BEGIN`, `COMMIT`, `ROLLBACK`).
4. **💳 Módulo 3 (Cuentas por Pagar):** Control de facturas con proveedores, fechas de vencimiento y módulo de abonos parciales o totales.
5. **📈 Módulo 4 (Productos Más Vendidos):** Ranking mensual con medallas (🥇🥈🥉), rotación (Alta, Media, Baja), participación porcentual y estimación de ingresos.
6. **🏢 Módulo 5 (Directorio de Proveedores):** Contactos, días de crédito y cálculo dinámico de deudas activas.
7. **👥 Módulo 6 (Gestión de Usuarios):** Administración de credenciales y roles (Administrador, Supervisor, Operador).
8. **💵 Tasa Oficial del Día (BCV):** Parámetro editable directamente desde la interfaz y persistido en PostgreSQL.

---

## 🛠️ Stack Tecnológico
* **Backend:** Node.js (v26) + Express.js (v5.3)
* **Base de Datos:** PostgreSQL 18 (`camadu_db`)
* **Driver BD:** `pg` (node-postgres Pool con sentencias parametrizadas)
* **Frontend:** Single Page Application (SPA) nativa (HTML5, CSS3 responsivo y Vanilla JavaScript)
* **Diseño:** Paleta de colores oficial inspirada en el logotipo corporativo

---

## ⚙️ Instalación y Puesta en Marcha

### Requisitos Previos
* [Node.js](https://nodejs.org/) (versión 20 o superior instalada).
* [PostgreSQL 18](https://www.postgresql.org/) ejecutándose en `localhost:5432`.

### Pasos
1. Clonar el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd kori
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno (`.env`):
   Copia el archivo `.env.example` a `.env` y ajusta tus credenciales de PostgreSQL:
   ```env
   PORT=4000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=camadu_db
   DB_USER=postgres
   DB_PASSWORD=tu_contraseña
   ```

4. Iniciar la aplicación:
   ```bash
   npm start
   ```

5. Abrir en el navegador:
   👉 **http://localhost:4000**

---

## 📖 Documentación Detallada
Para consultar el **Diagrama Entidad-Relación (DER)**, el Diccionario de Datos y las **Delimitaciones Técnicas completas para la Tesis**, consulta el archivo:
📄 [`MODELO_Y_DELIMITACIONES_TECNICAS.md`](./MODELO_Y_DELIMITACIONES_TECNICAS.md)

