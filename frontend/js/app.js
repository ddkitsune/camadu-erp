const app = {
  activeView: 'dashboard',
  productosCache: [],
  proveedoresCache: [],
  usuariosCache: [],
  tasaDolar: 48.50,

  // Usuario en sesión activa
  currentUser: null,

  init() {
    this.setupNavigation();
    this.startClock();
    this.initCurrentUser();

    if (this.currentUser) {
      this.mostrarApp();
    } else {
      this.mostrarLogin();
    }
  },

  // Inicializar o restaurar usuario activo desde LocalStorage
  initCurrentUser() {
    try {
      const saved = localStorage.getItem('camadu_session');
      if (saved) {
        this.currentUser = JSON.parse(saved);
      } else {
        this.currentUser = null;
      }
    } catch (e) {
      console.warn('No se pudo restaurar sesión:', e);
      this.currentUser = null;
    }
  },

  // Mostrar interfaz completa del ERP al estar autenticado
  mostrarApp() {
    const loginView = document.getElementById('view-login');
    const appContainer = document.getElementById('app-container');
    if (loginView) loginView.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    this.loadTasa();
    this.loadDashboard();
    this.loadProductosSelect();
    if (this.currentUser && this.currentUser.rol !== 'VENDEDOR' && this.currentUser.rol !== 'CAJERO') {
      this.loadProveedoresSelect();
    }
    this.aplicarPermisosRol();
    this.navigateTo(this.activeView || 'dashboard');
  },

  // Mostrar pantalla de login al cerrar sesión o no tener credenciales
  mostrarLogin() {
    const loginView = document.getElementById('view-login');
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.style.display = 'none';
    if (loginView) loginView.style.display = 'flex';

    const err = document.getElementById('login-error-msg');
    if (err) err.style.display = 'none';

    const usernameInput = document.getElementById('login-username');
    if (usernameInput) usernameInput.focus();
  },

  // Manejo del formulario de Login con PostgreSQL
  async iniciarSesion(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-login-submit');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Por favor complete su usuario y contraseña.';
        errorEl.style.display = 'block';
      }
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verificando credenciales...</span>';
      }
      if (errorEl) errorEl.style.display = 'none';

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: password.trim() })
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('El backend no respondió en formato JSON. Si acaba de actualizar el proyecto con git pull, por favor reinicie el servidor con "npm start" en su terminal.');
      }

      if (data.success && data.user) {
        this.currentUser = data.user;
        localStorage.setItem('camadu_session', JSON.stringify(data.user));
        this.mostrarApp();
      } else {
        if (errorEl) {
          errorEl.textContent = data.message || 'Error al iniciar sesión.';
          errorEl.style.display = 'block';
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Error de conexión con el servidor. Verifique que la aplicación y PostgreSQL estén activos.';
        errorEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Ingresar al Sistema</span> <span style="font-size: 18px;">→</span>';
      }
    }
  },

  // Cerrar sesión y regresar al login
  cerrarSesion() {
    if (!confirm('¿Confirma que desea cerrar su sesión en el sistema?')) return;
    this.currentUser = null;
    localStorage.removeItem('camadu_session');
    localStorage.removeItem('camadu_active_user');

    const pInput = document.getElementById('login-password');
    if (pInput) pInput.value = '';

    this.mostrarLogin();
  },

  // Rellenar credenciales para demostración rápida ante tutores
  autofillLogin(username, password) {
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    if (uInput) uInput.value = username;
    if (pInput) pInput.value = password;
    const err = document.getElementById('login-error-msg');
    if (err) err.style.display = 'none';
  },

  // Mostrar / ocultar texto de contraseña en login
  toggleLoginPwd() {
    const pInput = document.getElementById('login-password');
    if (!pInput) return;
    pInput.type = pInput.type === 'password' ? 'text' : 'password';
  },

  // Helper para iniciales de avatar
  getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  },

  // Helper para formato de rol en UI
  getRolLabel(rol) {
    rol = (rol || '').toUpperCase();
    if (rol === 'ADMINISTRADOR') return '👑 Administrador';
    if (rol === 'SUPERVISOR') return '⚡ Supervisor';
    if (rol === 'VENDEDOR') return '🏷️ Vendedor';
    if (rol === 'CAJERO') return '💵 Cajero';
    return '👤 ' + rol;
  },

  getRolShort(rol) {
    rol = (rol || '').toUpperCase();
    if (rol === 'ADMINISTRADOR') return '👑 Admin';
    if (rol === 'SUPERVISOR') return '⚡ Superv';
    if (rol === 'VENDEDOR') return '🏷️ Vendedor';
    if (rol === 'CAJERO') return '💵 Cajero';
    return '👤 Operador';
  },

  // Centralizador de peticiones con cabeceras de autorización RBAC
  async apiFetch(url, options = {}) {
    const rol = this.currentUser ? this.currentUser.rol : 'ADMINISTRADOR';
    const uid = this.currentUser ? this.currentUser.id : 1;
    options.headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      'x-user-role': rol,
      'x-user-id': uid
    };
    const res = await fetch(url, options);
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      alert('🚫 ' + (data.message || 'Acceso Denegado por permisos de rol.'));
    }
    return res;
  },

  // Aplicar restricciones de interfaz según el rol del usuario
  aplicarPermisosRol() {
    const rol = (this.currentUser.rol || '').toUpperCase();

    // 1. Actualizar pie de barra lateral (Sidebar)
    const avatarEl = document.getElementById('sidebar-user-avatar');
    if (avatarEl) avatarEl.textContent = this.getInitials(this.currentUser.nombre_completo);

    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = this.currentUser.nombre_completo;

    const roleEl = document.getElementById('sidebar-user-role');
    if (roleEl) roleEl.textContent = this.getRolLabel(rol);

    // 2. Actualizar badge superior de usuario activo
    const navBadge = document.getElementById('nav-user-badge');
    if (navBadge) {
      navBadge.textContent = `👤 ${this.currentUser.nombre_completo} (${this.getRolShort(rol)})`;
    }

    // 3. Prellenar responsable de movimiento en almacén
    const respInput = document.getElementById('mov-responsable');
    if (respInput) respInput.value = this.currentUser.nombre_completo;

    // 4. Regla estricta: Vendedores y Cajeros SIN ACCESO A PROVEEDORES
    const navItemProv = document.getElementById('nav-item-proveedores');
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      if (navItemProv) navItemProv.style.display = 'none';
      if (this.activeView === 'proveedores') {
        this.navigateTo('dashboard');
      }
    } else {
      if (navItemProv) navItemProv.style.display = 'flex';
    }

    // 5. Regla estricta: Solo Administradores pueden gestionar usuarios
    const navItemUsers = document.getElementById('nav-item-usuarios');
    const navSecSeg = document.getElementById('nav-sec-seguridad');
    if (rol !== 'ADMINISTRADOR') {
      if (navItemUsers) navItemUsers.style.display = 'none';
      if (navSecSeg) navSecSeg.style.display = 'none';
      if (this.activeView === 'usuarios') {
        this.navigateTo('dashboard');
      }
    } else {
      if (navItemUsers) navItemUsers.style.display = 'flex';
      if (navSecSeg) navSecSeg.style.display = 'block';
    }
  },

  // Abrir modal para alternar o simular usuario activo
  async abrirModalCambiarUsuario() {
    try {
      const res = await fetch('/api/usuarios');
      const json = await res.json();
      const listContainer = document.getElementById('lista-usuarios-switcher');
      if (!listContainer) return;
      listContainer.innerHTML = '';

      const users = json.data || [];
      if (users.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No hay usuarios registrados en PostgreSQL.</p>';
      } else {
        users.forEach(u => {
          const isActive = this.currentUser && this.currentUser.id === u.id;
          const card = document.createElement('div');
          card.className = `user-card-item ${isActive ? 'active-user' : ''}`;
          card.onclick = () => this.cambiarUsuarioActivo(u);

          let rolBadgeClass = 'badge-operador';
          let rolCondicion = '';
          if (u.rol === 'ADMINISTRADOR') {
            rolBadgeClass = 'badge-admin';
            rolCondicion = 'Acceso Total al Sistema';
          } else if (u.rol === 'SUPERVISOR') {
            rolBadgeClass = 'badge-supervisor';
            rolCondicion = 'Supervisión de Almacén y Finanzas';
          } else if (u.rol === 'VENDEDOR') {
            rolBadgeClass = 'badge-vendedor';
            rolCondicion = '🚫 SIN ACCESO A PROVEEDORES';
          } else if (u.rol === 'CAJERO') {
            rolBadgeClass = 'badge-cajero';
            rolCondicion = '🚫 SIN ACCESO A PROVEEDORES';
          } else {
            rolBadgeClass = 'badge-operador';
            rolCondicion = 'Operador Estándar';
          }

          card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), #be185d); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                ${this.getInitials(u.nombre_completo)}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 14px; color: var(--text-main);">${u.nombre_completo}</div>
                <div style="font-size: 11px; color: var(--text-muted);">
                  <code>${u.username}</code> · <span style="color: ${u.rol === 'VENDEDOR' || u.rol === 'CAJERO' ? 'var(--danger)' : 'var(--primary)'}; font-weight: 600;">${rolCondicion}</span>
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge ${rolBadgeClass}">${this.getRolLabel(u.rol)}</span>
              ${isActive ? '<span style="font-size: 16px; color: var(--success); font-weight: 800;" title="Usuario Activo">✓</span>' : ''}
            </div>
          `;
          listContainer.appendChild(card);
        });
      }

      const modal = document.getElementById('modal-cambiar-usuario');
      if (modal) modal.classList.add('active');
    } catch (e) {
      alert('Error cargando lista de usuarios');
    }
  },

  // Seleccionar usuario para sesión activa
  cambiarUsuarioActivo(user) {
    this.currentUser = user;
    try {
      localStorage.setItem('camadu_session', JSON.stringify(user));
      localStorage.setItem('camadu_active_user', JSON.stringify(user));
    } catch (e) {}

    this.aplicarPermisosRol();
    this.cerrarModal('modal-cambiar-usuario');

    const rol = (user.rol || '').toUpperCase();
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      alert(`✅ Sesión activa cambiada a:\n👤 ${user.nombre_completo}\n🏷️ Rol: ${rol}\n\n🔒 CONDICIÓN APLICADA:\nEste usuario NO tiene acceso al Directorio de Proveedores ni a la modificación de compras.`);
    } else {
      alert(`✅ Sesión activa cambiada a:\n👤 ${user.nombre_completo}\n👑 Rol: ${rol}\n\n✨ Acceso total activado.`);
    }

    // Redirigir si la vista actual no está permitida
    if (this.activeView === 'proveedores' && (rol === 'VENDEDOR' || rol === 'CAJERO')) {
      this.navigateTo('dashboard');
    } else if (this.activeView === 'usuarios' && rol !== 'ADMINISTRADOR') {
      this.navigateTo('dashboard');
    } else {
      this.navigateTo(this.activeView);
    }
  },

  // Reloj en tiempo real
  startClock() {
    const updateTime = () => {
      const now = new Date();
      const str = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const el = document.getElementById('clock-display');
      if (el) el.textContent = str;
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  // Cargar Tasa oficial del día desde PostgreSQL
  async loadTasa() {
    try {
      const res = await fetch('/api/configuracion/tasa');
      const json = await res.json();
      if (json.success && json.tasa) {
        this.tasaDolar = parseFloat(json.tasa);
        const el = document.getElementById('nav-tasa-dolar');
        if (el) el.textContent = `💵 Tasa BCV: 1 USD = Bs. ${this.tasaDolar.toFixed(2)}`;
      }
    } catch (e) {
      console.error('Error cargando tasa:', e);
    }
  },

  abrirModalTasa() {
    const rol = (this.currentUser && this.currentUser.rol || '').toUpperCase();
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      return alert(`🚫 Acceso Denegado: Los usuarios con rol '${rol}' no tienen autorización para modificar la tasa oficial BCV.`);
    }

    const input = document.getElementById('tasa-valor-input');
    if (input) input.value = this.tasaDolar.toFixed(2);
    const modal = document.getElementById('modal-tasa');
    if (modal) modal.classList.add('active');
  },

  async guardarTasa(e) {
    e.preventDefault();
    const input = document.getElementById('tasa-valor-input');
    const valor = parseFloat(input.value);
    if (!valor || valor <= 0) return alert('Por favor ingresa una tasa válida mayor a 0');

    try {
      const res = await this.apiFetch('/api/configuracion/tasa', {
        method: 'POST',
        body: JSON.stringify({ tasa: valor })
      });
      const json = await res.json();
      if (json.success) {
        this.tasaDolar = valor;
        const el = document.getElementById('nav-tasa-dolar');
        if (el) el.textContent = `💵 Tasa BCV: 1 USD = Bs. ${this.tasaDolar.toFixed(2)}`;
        this.cerrarModal('modal-tasa');
        // Refrescar vistas activas para actualizar precios en Bs.
        if (this.activeView === 'inventario') this.loadInventario();
        if (this.activeView === 'cxp') this.loadCxP();
        if (this.activeView === 'dashboard') this.loadDashboard();
        alert('✅ Tasa oficial de cambio actualizada correctamente en PostgreSQL.');
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert('Error al actualizar tasa');
    }
  },

  // Enrutamiento de navegación SPA
  setupNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        this.navigateTo(view);
      });
    });
  },

  navigateTo(viewName) {
    const rol = (this.currentUser && this.currentUser.rol || '').toUpperCase();

    // Verificación estricta de permisos de navegación
    if ((rol === 'VENDEDOR' || rol === 'CAJERO') && viewName === 'proveedores') {
      return alert(`🚫 Acceso Denegado: Su rol ('${rol}') no tiene autorización para acceder al Directorio de Proveedores.`);
    }

    if (rol !== 'ADMINISTRADOR' && viewName === 'usuarios') {
      return alert(`🚫 Acceso Denegado: Se requieren permisos de ADMINISTRADOR para acceder al Módulo de Gestión de Usuarios.`);
    }

    this.activeView = viewName;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.style.display = 'none';
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) activeSec.style.display = 'block';

    // Actualizar encabezados
    const titles = {
      dashboard: ['Dashboard General', 'Visión 360° del flujo operativo y control de stock'],
      inventario: ['Módulo 1: Control de Inventario y Stock', 'Catálogo de piezas, productos e insumos con umbrales mínimos'],
      movimientos: ['Módulo 2: Control de Entradas y Salidas', 'Trazabilidad física de movimientos (compras, ventas y mermas)'],
      cxp: ['Módulo 3: Cuentas por Pagar', 'Control financiero de deudas a proveedores y vencimientos'],
      reportes: ['Módulo 4: Productos Más Vendidos', 'Análisis mensual de rotación de productos para compras estratégicas'],
      proveedores: ['Módulo 5: Directorio de Proveedores', 'Contactos, días de crédito y compromisos financieros'],
      usuarios: ['Módulo 6: Gestión de Usuarios', 'Control de credenciales, roles y acceso al sistema en PostgreSQL']
    };

    if (titles[viewName]) {
      document.getElementById('page-title').textContent = titles[viewName][0];
      document.getElementById('page-subtitle').textContent = titles[viewName][1];
    }

    // Cargar datos según la vista
    if (viewName === 'dashboard') this.loadDashboard();
    if (viewName === 'inventario') this.loadInventario();
    if (viewName === 'movimientos') this.loadMovimientos();
    if (viewName === 'cxp') this.loadCxP();
    if (viewName === 'reportes') this.loadReportes();
    if (viewName === 'proveedores') this.loadProveedores();
    if (viewName === 'usuarios') this.loadUsuarios();
  },

  // ==========================================
  // 📊 DASHBOARD GENERAL
  // ==========================================
  async loadDashboard() {
    try {
      const res = await fetch('/api/dashboard/stats');
      const json = await res.json();
      if (json.success) {
        document.getElementById('kpi-total-productos').textContent = json.data.totalProductos;
        document.getElementById('kpi-stock-critico').textContent = json.data.stockCritico;
        document.getElementById('kpi-deuda-cxp').textContent = `$${json.data.deudaCxP.toFixed(2)}`;
        document.getElementById('kpi-salidas-mes').textContent = `${json.data.salidasMes} und`;

        const alertaCxP = document.getElementById('kpi-cxp-alerta');
        if (alertaCxP) {
          alertaCxP.textContent = json.data.facturasPorVencer > 0 ? `⚠️ ${json.data.facturasPorVencer} factura(s) por vencer` : '';
        }
      }

      // Cargar productos con alerta crítica
      const prodRes = await fetch('/api/productos?estado_stock=critico');
      const prodJson = await prodRes.json();
      const tbody = document.querySelector('#tabla-dashboard-alertas tbody');
      tbody.innerHTML = '';

      if (prodJson.data && prodJson.data.length > 0) {
        prodJson.data.forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${p.codigo}</strong></td>
            <td>${p.nombre}</td>
            <td>${p.material || 'N/A'}</td>
            <td><strong style="color: var(--danger);">${p.stock_actual} und</strong></td>
            <td>${p.stock_minimo} und</td>
            <td><span class="badge badge-danger">⚠️ Reposición Crítica</span></td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="app.registrarEntradaRapida(${p.id}, '${p.nombre}')">Reabastecer</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--success); padding: 20px;">✅ ¡Excelente! Todos los productos están por encima del stock mínimo.</td></tr>';
      }
    } catch (e) {
      console.error('Error cargando dashboard:', e);
    }
  },

  // ==========================================
  // 📦 MÓDULO 1: INVENTARIO & STOCK
  // ==========================================
  async loadInventario(busqueda = '') {
    try {
      const url = busqueda ? `/api/productos?busqueda=${encodeURIComponent(busqueda)}` : '/api/productos';
      const res = await fetch(url);
      const json = await res.json();
      this.productosCache = json.data || [];

      const tbody = document.querySelector('#tabla-productos tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (this.productosCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay productos registrados. Pulsa "+ Nuevo Producto" para comenzar.</td></tr>';
        return;
      }

      this.productosCache.forEach(p => {
        const esCritico = p.stock_actual <= p.stock_minimo;
        const costo = parseFloat(p.precio_costo) || 0;
        const venta = parseFloat(p.precio_venta) || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${p.codigo}</strong></td>
          <td>
            <strong>${p.nombre}</strong>
            <div style="font-size: 12px; color: var(--text-muted);">${p.descripcion || ''}</div>
          </td>
          <td>${p.material}</td>
          <td>
            <div>$${costo.toFixed(2)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">Bs. ${(costo * this.tasaDolar).toFixed(2)}</div>
          </td>
          <td>
            <strong>$${venta.toFixed(2)}</strong>
            <div style="font-size: 11px; color: var(--primary); font-weight: 700;">Bs. ${(venta * this.tasaDolar).toFixed(2)}</div>
          </td>
          <td><strong style="color: ${esCritico ? 'var(--danger)' : 'var(--text-main)'}; font-size: 15px;">${p.stock_actual}</strong></td>
          <td>${p.stock_minimo}</td>
          <td>
            <span class="badge ${esCritico ? 'badge-danger' : 'badge-success'}">
              ${esCritico ? '⚠️ Stock Bajo' : '✓ Normal'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="app.editarProducto(${p.id})">Editar</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="app.eliminarProducto(${p.id})">Borrar</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  },

  buscarProductos(query) {
    this.loadInventario(query);
  },

  abrirModalNuevoProducto() {
    document.getElementById('form-producto').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-producto-titulo').textContent = 'Registrar Nuevo Producto';
    document.getElementById('modal-producto').classList.add('active');
  },

  editarProducto(id) {
    const p = this.productosCache.find(item => item.id === id);
    if (!p) return;
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-codigo').value = p.codigo;
    document.getElementById('prod-nombre').value = p.nombre;
    document.getElementById('prod-material').value = p.material;
    document.getElementById('prod-descripcion').value = p.descripcion || '';
    document.getElementById('prod-stock-actual').value = p.stock_actual;
    document.getElementById('prod-stock-minimo').value = p.stock_minimo;
    document.getElementById('prod-precio-costo').value = p.precio_costo;
    document.getElementById('prod-precio-venta').value = p.precio_venta;

    document.getElementById('modal-producto-titulo').textContent = 'Editar Producto';
    document.getElementById('modal-producto').classList.add('active');
  },

  async guardarProducto(e) {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const data = {
      codigo: document.getElementById('prod-codigo').value,
      nombre: document.getElementById('prod-nombre').value,
      material: document.getElementById('prod-material').value,
      descripcion: document.getElementById('prod-descripcion').value,
      stock_actual: parseInt(document.getElementById('prod-stock-actual').value, 10),
      stock_minimo: parseInt(document.getElementById('prod-stock-minimo').value, 10),
      precio_costo: parseFloat(document.getElementById('prod-precio-costo').value),
      precio_venta: parseFloat(document.getElementById('prod-precio-venta').value)
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/productos/${id}` : '/api/productos';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-producto');
        this.loadInventario();
        this.loadDashboard();
        this.loadProductosSelect();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert('Error al guardar producto');
    }
  },

  async eliminarProducto(id) {
    if (!confirm('¿Confirma que desea eliminar este producto?')) return;
    try {
      const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        this.loadInventario();
        this.loadDashboard();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al eliminar producto');
    }
  },

  // ==========================================
  // 🔄 MÓDULO 2: ENTRADAS Y SALIDAS
  // ==========================================
  async loadMovimientos() {
    try {
      const res = await fetch('/api/movimientos');
      const json = await res.json();
      const tbody = document.querySelector('#tabla-movimientos tbody');
      tbody.innerHTML = '';

      json.data.forEach(m => {
        const esEntrada = m.tipo === 'ENTRADA';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-size: 13px; color: var(--text-muted);">${new Date(m.fecha).toLocaleString('es-VE')}</td>
          <td>
            <span class="badge ${esEntrada ? 'badge-success' : 'badge-danger'}">
              ${esEntrada ? '📥 ENTRADA' : '📤 SALIDA'}
            </span>
          </td>
          <td><strong>${m.motivo}</strong></td>
          <td>
            <strong>${m.producto_nombre}</strong> (${m.producto_codigo})
            <div style="font-size: 12px; color: var(--text-muted);">${m.producto_material || ''}</div>
          </td>
          <td><strong style="color: ${esEntrada ? 'var(--success)' : 'var(--danger)'}; font-size: 15px;">${esEntrada ? '+' : '-'}${m.cantidad}</strong></td>
          <td><code>${m.numero_documento || 'S/N'}</code></td>
          <td>${m.responsable}</td>
          <td style="font-size: 13px; color: var(--text-muted);">${m.nota || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  },

  async loadProductosSelect() {
    try {
      const res = await fetch('/api/productos');
      const json = await res.json();
      const sel = document.getElementById('mov-producto-id');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Seleccionar Producto --</option>';
      json.data.forEach(p => {
        sel.innerHTML += `<option value="${p.id}">${p.codigo} - ${p.nombre} (Stock: ${p.stock_actual})</option>`;
      });
    } catch (e) {
      console.error(e);
    }
  },

  ajustarMotivos(tipo) {
    const sel = document.getElementById('mov-motivo');
    sel.innerHTML = '';
    if (tipo === 'ENTRADA') {
      sel.innerHTML = `
        <option value="COMPRA">Compra a Proveedor</option>
        <option value="DEVOLUCION_CLIENTE">Devolución de Cliente</option>
        <option value="AJUSTE">Ajuste de Inventario</option>
      `;
    } else {
      sel.innerHTML = `
        <option value="VENTA">Venta Diaria / Despacho</option>
        <option value="MERMA">Merma / Daño de Material</option>
        <option value="DEVOLUCION_PROVEEDOR">Devolución a Proveedor</option>
      `;
    }
  },

  abrirModalNuevoMovimiento() {
    document.getElementById('form-movimiento').reset();
    this.ajustarMotivos('ENTRADA');
    this.loadProductosSelect();
    document.getElementById('modal-movimiento').classList.add('active');
  },

  registrarEntradaRapida(productoId, nombre) {
    this.abrirModalNuevoMovimiento();
    document.getElementById('mov-tipo').value = 'ENTRADA';
    this.ajustarMotivos('ENTRADA');
    document.getElementById('mov-producto-id').value = productoId;
    document.getElementById('mov-motivo').value = 'COMPRA';
    document.getElementById('mov-nota').value = `Reabastecimiento urgente de ${nombre}`;
  },

  async guardarMovimiento(e) {
    e.preventDefault();
    const data = {
      producto_id: document.getElementById('mov-producto-id').value,
      tipo: document.getElementById('mov-tipo').value,
      motivo: document.getElementById('mov-motivo').value,
      cantidad: parseInt(document.getElementById('mov-cantidad').value, 10),
      numero_documento: document.getElementById('mov-documento').value,
      responsable: document.getElementById('mov-responsable').value,
      nota: document.getElementById('mov-nota').value
    };

    try {
      const res = await fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-movimiento');
        this.loadMovimientos();
        this.loadInventario();
        this.loadDashboard();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al registrar movimiento');
    }
  },

  // ==========================================
  // 💳 MÓDULO 3: CUENTAS POR PAGAR
  // ==========================================
  async loadCxP() {
    try {
      const res = await fetch('/api/cuentas-por-pagar');
      const json = await res.json();
      const tbody = document.querySelector('#tabla-cxp tbody');
      tbody.innerHTML = '';

      if (!json.data || json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay cuentas por pagar registradas.</td></tr>';
        return;
      }

      json.data.forEach(c => {
        const total = parseFloat(c.monto_total) || 0;
        const pagado = parseFloat(c.monto_pagado) || 0;
        const saldo = total - pagado;
        const tr = document.createElement('tr');
        
        let badgeClass = 'badge-warning';
        if (c.estatus === 'PAGADA') badgeClass = 'badge-success';
        if (c.estatus === 'PENDIENTE') badgeClass = 'badge-danger';

        tr.innerHTML = `
          <td>
            <strong>${c.nombre_empresa}</strong>
            <div style="font-size: 12px; color: var(--text-muted);">${c.proveedor_telefono || ''}</div>
          </td>
          <td><code>${c.numero_factura}</code></td>
          <td><strong>$${total.toFixed(2)}</strong></td>
          <td style="color: var(--success);">$${pagado.toFixed(2)}</td>
          <td><strong style="color: ${saldo > 0 ? 'var(--danger)' : 'var(--success)'}; font-size: 15px;">$${saldo.toFixed(2)}</strong></td>
          <td>${c.fecha_vencimiento}</td>
          <td><span class="badge ${badgeClass}">${c.estatus}</span></td>
          <td>
            ${saldo > 0 ? `<button class="btn btn-primary btn-sm" onclick="app.abrirModalAbono(${c.id}, '${c.numero_factura}', ${saldo})">Pagar / Abonar</button>` : '<span style="color: var(--success); font-weight: 600;">✓ Cancelada</span>'}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  },

  async loadProveedoresSelect() {
    try {
      const res = await fetch('/api/proveedores');
      const json = await res.json();
      this.proveedoresCache = json.data || [];
      const sel = document.getElementById('cxp-proveedor-id');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Seleccionar Proveedor --</option>';
      this.proveedoresCache.forEach(pr => {
        sel.innerHTML += `<option value="${pr.id}">${pr.nombre_empresa} (${pr.condiciones_pago || 'Crédito'})</option>`;
      });
    } catch (e) {
      console.error(e);
    }
  },

  abrirModalNuevaCxP() {
    document.getElementById('form-cxp').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('cxp-emision').value = today;
    this.loadProveedoresSelect();
    document.getElementById('modal-cxp').classList.add('active');
  },

  async guardarCxP(e) {
    e.preventDefault();
    const data = {
      proveedor_id: document.getElementById('cxp-proveedor-id').value,
      numero_factura: document.getElementById('cxp-factura').value,
      monto_total: parseFloat(document.getElementById('cxp-monto').value),
      fecha_emision: document.getElementById('cxp-emision').value,
      fecha_vencimiento: document.getElementById('cxp-vencimiento').value,
      notas: document.getElementById('cxp-notas').value
    };

    try {
      const res = await fetch('/api/cuentas-por-pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-cxp');
        this.loadCxP();
        this.loadDashboard();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al registrar cuenta por pagar');
    }
  },

  abrirModalAbono(id, factura, saldo) {
    document.getElementById('form-abono').reset();
    document.getElementById('abono-cuenta-id').value = id;
    document.getElementById('abono-info-texto').innerHTML = `Abonar a Factura: <strong>${factura}</strong> | Saldo Pendiente: <strong style="color: var(--danger);">$${saldo.toFixed(2)}</strong>`;
    document.getElementById('abono-monto').value = saldo.toFixed(2);
    document.getElementById('modal-abono').classList.add('active');
  },

  async guardarAbono(e) {
    e.preventDefault();
    const id = document.getElementById('abono-cuenta-id').value;
    const data = {
      monto: parseFloat(document.getElementById('abono-monto').value),
      metodo_pago: document.getElementById('abono-metodo').value,
      referencia: document.getElementById('abono-ref').value
    };

    try {
      const res = await fetch(`/api/cuentas-por-pagar/${id}/pagos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-abono');
        this.loadCxP();
        this.loadDashboard();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al procesar el pago');
    }
  },

  // ==========================================
  // 📈 MÓDULO 4: PRODUCTOS MÁS VENDIDOS DEL MES
  // ==========================================
  async loadReportes() {
    try {
      const res = await fetch('/api/reportes/mas-vendidos');
      const json = await res.json();
      const tbody = document.querySelector('#tabla-mas-vendidos tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (json.success && json.data) {
        const badgePeriodo = document.getElementById('badge-periodo-reporte');
        if (badgePeriodo) {
          badgePeriodo.textContent = `Período: ${json.data.periodo} | Total Vendido: ${json.data.totalUnidadesVendidas} und`;
        }

        const productos = json.data.productos;
        if (!productos || productos.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No se registraron ventas en el mes actual.</td></tr>';
          return;
        }

        productos.forEach(p => {
          const tr = document.createElement('tr');
          let badgeRotacion = '';
          if (p.rotacion === 'ALTA') {
            badgeRotacion = '<span class="badge badge-success">🔥 Alta Demanda</span>';
          } else if (p.rotacion === 'MEDIA') {
            badgeRotacion = '<span class="badge badge-info">⚡ Media Salida</span>';
          } else {
            badgeRotacion = '<span class="badge badge-warning">⚠️ Baja Salida / Liquidar</span>';
          }

          let rankBadge = '';
          if (p.ranking === 1) rankBadge = '🥇';
          else if (p.ranking === 2) rankBadge = '🥈';
          else if (p.ranking === 3) rankBadge = '🥉';
          else rankBadge = `#${p.ranking}`;

          tr.innerHTML = `
            <td><strong>${rankBadge}</strong></td>
            <td><code>${p.codigo}</code></td>
            <td><strong>${p.nombre}</strong></td>
            <td>${p.material || 'N/A'}</td>
            <td><strong style="color: var(--primary); font-size: 1.05rem;">${p.total_vendido} und</strong></td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>${p.participacion}%</span>
                <div style="background: #e2e8f0; border-radius: 4px; width: 60px; height: 6px; overflow: hidden;">
                  <div style="background: var(--primary); width: ${p.participacion}%; height: 100%;"></div>
                </div>
              </div>
            </td>
            <td>$${parseFloat(p.ingreso_estimado).toFixed(2)}</td>
            <td>${badgeRotacion}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.error('Error cargando reporte de más vendidos:', e);
    }
  },

  // ==========================================
  // 🏢 MÓDULO 5: PROVEEDORES
  // ==========================================
  async loadProveedores() {
    const rol = (this.currentUser && this.currentUser.rol || '').toUpperCase();
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      alert(`🚫 Acceso Denegado: Su rol ('${rol}') no tiene autorización para acceder al Directorio de Proveedores.`);
      this.navigateTo('dashboard');
      return;
    }

    try {
      const res = await this.apiFetch('/api/proveedores');
      const json = await res.json();
      this.proveedoresCache = json.data || [];
      const tbody = document.querySelector('#tabla-proveedores tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (this.proveedoresCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay proveedores registrados. Pulsa "+ Nuevo Proveedor" para registrar el primero.</td></tr>';
        return;
      }

      this.proveedoresCache.forEach(pr => {
        const saldo = parseFloat(pr.saldo_deuda) || 0;
        const dias = parseInt(pr.dias_credito, 10) || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${pr.nombre_empresa}</strong></td>
          <td>${pr.nombre_contacto || '-'}</td>
          <td>${pr.telefono || '-'}</td>
          <td>${pr.email || '-'}</td>
          <td><strong>${dias} días</strong></td>
          <td>${pr.condiciones_pago || '-'}</td>
          <td><strong style="color: ${saldo > 0 ? 'var(--danger)' : 'var(--success)'}; font-size: 14px;">$${saldo.toFixed(2)}</strong></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="app.editarProveedor(${pr.id})">Editar</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="app.eliminarProveedor(${pr.id})">Borrar</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('Error al cargar proveedores:', e);
    }
  },

  abrirModalNuevoProveedor() {
    const rol = (this.currentUser && this.currentUser.rol || '').toUpperCase();
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      return alert(`🚫 Acceso Denegado: Su rol ('${rol}') no tiene permisos para crear proveedores.`);
    }

    document.getElementById('form-proveedor').reset();
    document.getElementById('prov-id').value = '';
    document.getElementById('modal-prov-titulo').textContent = 'Registrar Proveedor';
    document.getElementById('modal-proveedor').classList.add('active');
  },

  editarProveedor(id) {
    const rol = (this.currentUser && this.currentUser.rol || '').toUpperCase();
    if (rol === 'VENDEDOR' || rol === 'CAJERO') {
      return alert(`🚫 Acceso Denegado: Su rol ('${rol}') no tiene permisos para editar proveedores.`);
    }

    const pr = this.proveedoresCache.find(item => item.id === id);
    if (!pr) return;
    document.getElementById('prov-id').value = pr.id;
    document.getElementById('prov-empresa').value = pr.nombre_empresa;
    document.getElementById('prov-contacto').value = pr.nombre_contacto || '';
    document.getElementById('prov-telefono').value = pr.telefono || '';
    document.getElementById('prov-email').value = pr.email || '';
    document.getElementById('prov-direccion').value = pr.direccion || '';
    document.getElementById('prov-dias-credito').value = pr.dias_credito || 0;
    document.getElementById('prov-condiciones').value = pr.condiciones_pago || '';

    document.getElementById('modal-prov-titulo').textContent = 'Editar Proveedor';
    document.getElementById('modal-proveedor').classList.add('active');
  },

  async guardarProveedor(e) {
    e.preventDefault();
    const id = document.getElementById('prov-id').value;
    const data = {
      nombre_empresa: document.getElementById('prov-empresa').value,
      nombre_contacto: document.getElementById('prov-contacto').value,
      telefono: document.getElementById('prov-telefono').value,
      email: document.getElementById('prov-email').value,
      direccion: document.getElementById('prov-direccion').value,
      dias_credito: parseInt(document.getElementById('prov-dias-credito').value, 10),
      condiciones_pago: document.getElementById('prov-condiciones').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/proveedores/${id}` : '/api/proveedores';

    try {
      const res = await this.apiFetch(url, {
        method,
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-proveedor');
        this.loadProveedores();
        this.loadProveedoresSelect();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al guardar proveedor');
    }
  },

  async eliminarProveedor(id) {
    if (!confirm('¿Confirma que desea eliminar este proveedor?')) return;
    try {
      const res = await this.apiFetch(`/api/proveedores/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        this.loadProveedores();
        this.loadProveedoresSelect();
      } else {
        alert(json.message);
      }
    } catch (e) {
      alert('Error al eliminar proveedor');
    }
  },

  // ==========================================
  // 👥 MÓDULO 6: ADMINISTRACIÓN DE USUARIOS
  // ==========================================
  async loadUsuarios() {
    try {
      const res = await fetch('/api/usuarios');
      const json = await res.json();
      this.usuariosCache = json.data || [];
      const tbody = document.querySelector('#tabla-usuarios tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (this.usuariosCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay usuarios registrados.</td></tr>';
        return;
      }

      this.usuariosCache.forEach(u => {
        const tr = document.createElement('tr');
        let rolBadge = '';
        if (u.rol === 'ADMINISTRADOR') {
          rolBadge = '<span class="badge badge-admin">👑 Administrador</span>';
        } else if (u.rol === 'SUPERVISOR') {
          rolBadge = '<span class="badge badge-supervisor">⚡ Supervisor</span>';
        } else if (u.rol === 'VENDEDOR') {
          rolBadge = '<span class="badge badge-vendedor">🏷️ Vendedor (Sin Proveedores)</span>';
        } else if (u.rol === 'CAJERO') {
          rolBadge = '<span class="badge badge-cajero">💵 Cajero (Sin Proveedores)</span>';
        } else {
          rolBadge = '<span class="badge badge-operador">👤 Operador</span>';
        }

        const estadoBadge = u.activo 
          ? '<span class="badge badge-success">✓ Activo</span>' 
          : '<span class="badge badge-danger">Inactivo</span>';

        tr.innerHTML = `
          <td><strong>#${u.id}</strong></td>
          <td><strong>${u.nombre_completo}</strong></td>
          <td><code style="font-weight: 600; color: var(--text-main);">${u.username}</code></td>
          <td>${rolBadge}</td>
          <td>${u.email || '-'}</td>
          <td>${u.telefono || '-'}</td>
          <td>${estadoBadge}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="app.editarUsuario(${u.id})">Editar</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="app.eliminarUsuario(${u.id})">Borrar</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('Error cargando usuarios:', e);
    }
  },

  abrirModalNuevoUsuario() {
    document.getElementById('form-usuario').reset();
    document.getElementById('user-id').value = '';
    document.getElementById('user-password').required = true;
    document.getElementById('user-password-hint').style.display = 'none';
    document.getElementById('user-activo').checked = true;
    document.getElementById('modal-usuario-titulo').textContent = 'Registrar Nuevo Usuario';
    document.getElementById('modal-usuario').classList.add('active');
  },

  editarUsuario(id) {
    const u = this.usuariosCache.find(item => item.id === id);
    if (!u) return;
    document.getElementById('user-id').value = u.id;
    document.getElementById('user-nombre').value = u.nombre_completo;
    document.getElementById('user-username').value = u.username;
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = false;
    document.getElementById('user-password-hint').style.display = 'block';
    document.getElementById('user-rol').value = u.rol;
    document.getElementById('user-email').value = u.email || '';
    document.getElementById('user-telefono').value = u.telefono || '';
    document.getElementById('user-activo').checked = u.activo;

    document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuario';
    document.getElementById('modal-usuario').classList.add('active');
  },

  async guardarUsuario(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const data = {
      nombre_completo: document.getElementById('user-nombre').value,
      username: document.getElementById('user-username').value,
      password: document.getElementById('user-password').value,
      rol: document.getElementById('user-rol').value,
      email: document.getElementById('user-email').value,
      telefono: document.getElementById('user-telefono').value,
      activo: document.getElementById('user-activo').checked
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/usuarios/${id}` : '/api/usuarios';

    try {
      const res = await this.apiFetch(url, {
        method,
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        this.cerrarModal('modal-usuario');
        this.loadUsuarios();
        alert('✅ ' + json.message);
      } else {
        alert('⚠️ ' + json.message);
      }
    } catch (err) {
      alert('Error al guardar usuario');
    }
  },

  async eliminarUsuario(id) {
    if (!confirm('¿Confirma que desea eliminar este usuario del sistema?')) return;
    try {
      const res = await this.apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        this.loadUsuarios();
        alert('✅ ' + json.message);
      } else {
        alert('⚠️ ' + json.message);
      }
    } catch (e) {
      alert('Error al eliminar usuario');
    }
  },

  // Cerrar cualquier modal
  cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
