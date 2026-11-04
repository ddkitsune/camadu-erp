import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch

fig = plt.figure(figsize=(18, 12), dpi=300)
ax = fig.add_subplot(111)
ax.set_xlim(0, 1800)
ax.set_ylim(0, 1200)
ax.axis('off')

# Background
fig.patch.set_facecolor('#f8fafc')
ax.set_facecolor('#f8fafc')

# Title
ax.text(900, 1160, "DIAGRAMA ENTIDAD - RELACIÓN (DER) NORMALIZADO", 
        fontsize=18, fontweight='bold', ha='center', va='center', color='#0f172a', fontfamily='sans-serif')
ax.text(900, 1130, "Sistema de Gerencia y Planificación ERP | Heladería Camadu C.A. (PostgreSQL 18)", 
        fontsize=12, ha='center', va='center', color='#64748b', fontfamily='sans-serif')

# Function to draw an entity table
def draw_entity(x, y, w, title, color_header, attributes):
    # Header height 36, each row height 24, padding 10
    total_h = 40 + len(attributes) * 24 + 10
    bottom_y = y - total_h
    
    # Shadow
    shadow = FancyBboxPatch((x + 4, bottom_y - 4), w, total_h,
                            boxstyle="round,pad=0,rounding_size=8",
                            facecolor='#cbd5e1', edgecolor='none', alpha=0.5, zorder=2)
    ax.add_patch(shadow)
    
    # Body background
    body = FancyBboxPatch((x, bottom_y), w, total_h,
                          boxstyle="round,pad=0,rounding_size=8",
                          facecolor='#ffffff', edgecolor='#cbd5e1', linewidth=1.5, zorder=3)
    ax.add_patch(body)
    
    # Header
    header = FancyBboxPatch((x, y - 40), w, 40,
                            boxstyle="round,pad=0,rounding_size=8",
                            facecolor=color_header, edgecolor='none', zorder=4)
    ax.add_patch(header)
    
    # Square bottom of header so it fits seamlessly
    rect = patches.Rectangle((x, y - 40), w, 15, facecolor=color_header, edgecolor='none', zorder=4)
    ax.add_patch(rect)
    
    # Header Title
    ax.text(x + w / 2, y - 20, title, color='#ffffff', fontsize=11, fontweight='bold',
            ha='center', va='center', zorder=5, fontfamily='sans-serif')
    
    # Separator line under header
    ax.plot([x, x + w], [y - 40, y - 40], color='#e2e8f0', linewidth=1, zorder=5)
    
    # Rows
    curr_y = y - 55
    for tag, name, dtype in attributes:
        # Tag badge (PK, FK, UK)
        if tag == "PK":
            t_bg = "#fef08a" # yellow
            t_fg = "#854d0e"
        elif "FK" in tag:
            t_bg = "#cffafe" # cyan
            t_fg = "#0e7490"
        elif tag == "UK":
            t_bg = "#fce7f3" # pink
            t_fg = "#be185d"
        else:
            t_bg = "#f1f5f9"
            t_fg = "#64748b"
            
        badge = FancyBboxPatch((x + 10, curr_y - 7), 26, 14,
                               boxstyle="round,pad=0,rounding_size=3",
                               facecolor=t_bg, edgecolor='none', zorder=6)
        ax.add_patch(badge)
        ax.text(x + 23, curr_y, tag, color=t_fg, fontsize=7.5, fontweight='bold',
                ha='center', va='center', zorder=7)
        
        # Name
        ax.text(x + 42, curr_y, name, color='#1e293b', fontsize=8.5, fontweight='bold' if tag else 'normal',
                ha='left', va='center', zorder=7)
        # Type
        ax.text(x + w - 10, curr_y, dtype, color='#64748b', fontsize=8,
                ha='right', va='center', zorder=7, fontfamily='monospace')
        
        curr_y -= 24
        
    return {
        'x': x, 'y': y, 'w': w, 'h': total_h, 'bottom_y': bottom_y,
        'center_x': x + w / 2, 'center_y': y - total_h / 2,
        'left': x, 'right': x + w, 'top': y, 'bottom': bottom_y
    }

# 1. USUARIOS (Central Left)
usuarios_attrs = [
    ("PK", "id", "SERIAL"),
    ("UK", "username", "VARCHAR(60)"),
    ("",   "nombre_completo", "VARCHAR(150)"),
    ("",   "password", "VARCHAR(255)"),
    ("",   "rol", "VARCHAR(50)"),
    ("",   "email", "VARCHAR(120)"),
    ("",   "telefono", "VARCHAR(50)"),
    ("",   "activo", "BOOLEAN"),
    ("",   "creado_en", "TIMESTAMP")
]
box_users = draw_entity(60, 1050, 260, "USUARIOS", "#9f1239", usuarios_attrs)

# 2. CONFIGURACION (Top Left/Center)
config_attrs = [
    ("PK", "id", "SERIAL"),
    ("FK", "usuario_id", "INT (FK)"),
    ("UK", "clave", "VARCHAR(80)"),
    ("",   "valor", "TEXT"),
    ("",   "descripcion", "TEXT"),
    ("",   "actualizado_en", "TIMESTAMP")
]
box_config = draw_entity(420, 1050, 250, "CONFIGURACION", "#0284c7", config_attrs)

# 3. PRODUCTOS (Top Right)
productos_attrs = [
    ("PK", "id", "SERIAL"),
    ("UK", "codigo", "VARCHAR(50)"),
    ("",   "nombre", "VARCHAR(150)"),
    ("",   "material", "VARCHAR(100)"),
    ("",   "stock_actual", "INT"),
    ("",   "stock_minimo", "INT"),
    ("",   "precio_costo", "NUMERIC(12,2)"),
    ("",   "precio_venta", "NUMERIC(12,2)")
]
box_prod = draw_entity(1460, 1050, 260, "PRODUCTOS", "#d81159", productos_attrs)

# 4. MOVIMIENTOS_INVENTARIO (Center Right)
mov_attrs = [
    ("PK", "id", "SERIAL"),
    ("FK", "producto_id", "INT (FK)"),
    ("FK", "usuario_id", "INT (FK)"),
    ("",   "tipo", "VARCHAR(10)"),
    ("",   "motivo", "VARCHAR(50)"),
    ("",   "cantidad", "INT"),
    ("",   "numero_documento", "VARCHAR(80)"),
    ("",   "responsable", "VARCHAR(120)"),
    ("",   "fecha", "TIMESTAMP"),
    ("",   "nota", "TEXT")
]
box_mov = draw_entity(950, 1050, 270, "MOVIMIENTOS_INVENTARIO", "#e11d48", mov_attrs)

# 5. PROVEEDORES (Bottom Left)
prov_attrs = [
    ("PK", "id", "SERIAL"),
    ("",   "nombre_empresa", "VARCHAR(150)"),
    ("",   "nombre_contacto", "VARCHAR(120)"),
    ("",   "telefono", "VARCHAR(50)"),
    ("",   "email", "VARCHAR(120)"),
    ("",   "direccion", "TEXT"),
    ("",   "condiciones_pago", "VARCHAR(150)"),
    ("",   "dias_credito", "INT"),
    ("",   "creado_en", "TIMESTAMP")
]
box_prov = draw_entity(60, 520, 270, "PROVEEDORES", "#4f46e5", prov_attrs)

# 6. CUENTAS_POR_PAGAR (Bottom Center)
cxp_attrs = [
    ("PK", "id", "SERIAL"),
    ("FK", "proveedor_id", "INT (FK)"),
    ("",   "numero_factura", "VARCHAR(80)"),
    ("",   "monto_total", "NUMERIC(12,2)"),
    ("",   "monto_pagado", "NUMERIC(12,2)"),
    ("",   "fecha_emision", "DATE"),
    ("",   "fecha_vencimiento", "DATE"),
    ("",   "estatus", "VARCHAR(20)"),
    ("",   "notas", "TEXT"),
    ("",   "creado_en", "TIMESTAMP")
]
box_cxp = draw_entity(520, 520, 270, "CUENTAS_POR_PAGAR", "#059669", cxp_attrs)

# 7. PAGOS_CUENTAS (Bottom Right)
pagos_attrs = [
    ("PK", "id", "SERIAL"),
    ("FK", "cuenta_id", "INT (FK)"),
    ("FK", "usuario_id", "INT (FK)"),
    ("",   "monto", "NUMERIC(12,2)"),
    ("",   "metodo_pago", "VARCHAR(50)"),
    ("",   "referencia", "VARCHAR(100)"),
    ("",   "fecha_pago", "TIMESTAMP")
]
box_pagos = draw_entity(1020, 520, 260, "PAGOS_CUENTAS", "#0891b2", pagos_attrs)


# Function to draw relation connector with Cardinality labels
def draw_relation(p1, p2, label1="1", label2="N", style="orthogonal", color="#475569", text_label=""):
    x1, y1 = p1
    x2, y2 = p2
    
    if style == "direct":
        ax.plot([x1, x2], [y1, y2], color=color, linewidth=2, zorder=1)
        mid_x, mid_y = (x1 + x2)/2, (y1 + y2)/2
    elif style == "bezier":
        # Draw curved path
        verts = [(x1, y1), ((x1+x2)/2, y1), ((x1+x2)/2, y2), (x2, y2)]
        codes = [patches.Path.MOVETO, patches.Path.CURVE4, patches.Path.CURVE4, patches.Path.CURVE4]
        path = patches.Path(verts, codes)
        patch = patches.PathPatch(path, facecolor='none', edgecolor=color, lw=2, zorder=1)
        ax.add_patch(patch)
        mid_x, mid_y = (x1 + x2)/2, (y1 + y2)/2
    elif style == "ortho_h":
        mid_x = (x1 + x2) / 2
        ax.plot([x1, mid_x, mid_x, x2], [y1, y1, y2, y2], color=color, linewidth=2, zorder=1)
        mid_y = (y1 + y2) / 2
    elif style == "ortho_v":
        mid_y = (y1 + y2) / 2
        ax.plot([x1, x1, x2, x2], [y1, mid_y, mid_y, y2], color=color, linewidth=2, zorder=1)
        mid_x = (x1 + x2) / 2

    # Draw cardinality badges
    ax.text(x1 + (14 if x2 >= x1 else -14), y1 + (12 if y2 >= y1 else -12), label1,
            color='#b91c1c' if label1=='1' else '#1d4ed8', fontsize=9, fontweight='bold',
            ha='center', va='center', zorder=8,
            bbox=dict(boxstyle="circle,pad=0.2", facecolor="#ffffff", edgecolor=color, lw=1))
    
    ax.text(x2 + (-14 if x2 >= x1 else 14), y2 + (-12 if y2 >= y1 else 12), label2,
            color='#1d4ed8' if label2=='N' else '#b91c1c', fontsize=9, fontweight='bold',
            ha='center', va='center', zorder=8,
            bbox=dict(boxstyle="circle,pad=0.2", facecolor="#ffffff", edgecolor=color, lw=1))

    if text_label:
        ax.text(mid_x, mid_y + 10, text_label, fontsize=8, fontweight='bold', color=color,
                ha='center', va='center', zorder=8,
                bbox=dict(boxstyle="round,pad=0.2", facecolor="#ffffff", edgecolor='#e2e8f0', lw=1))


# Connectors:
# 1. USUARIOS -> CONFIGURACION (1:N)
draw_relation((box_users['right'], box_users['top'] - 60), 
              (box_config['left'], box_config['top'] - 60),
              label1="1", label2="N", style="direct", color="#0284c7", text_label="audita tasa")

# 2. USUARIOS -> MOVIMIENTOS_INVENTARIO (1:N)
draw_relation((box_users['right'], box_users['bottom'] + 40), 
              (box_mov['left'], box_mov['top'] - 80),
              label1="1", label2="N", style="bezier", color="#e11d48", text_label="registra flujo")

# 3. USUARIOS -> PAGOS_CUENTAS (1:N)
draw_relation((box_users['right'], box_users['bottom_y'] + 10), 
              (box_pagos['left'] + 50, box_pagos['top']),
              label1="1", label2="N", style="bezier", color="#0891b2", text_label="procesa abono")

# 4. PRODUCTOS -> MOVIMIENTOS_INVENTARIO (1:N)
draw_relation((box_prod['left'], box_prod['top'] - 50), 
              (box_mov['right'], box_mov['top'] - 50),
              label1="1", label2="N", style="direct", color="#d81159", text_label="afecta stock")

# 5. PROVEEDORES -> CUENTAS_POR_PAGAR (1:N)
draw_relation((box_prov['right'], box_prov['top'] - 60), 
              (box_cxp['left'], box_cxp['top'] - 60),
              label1="1", label2="N", style="direct", color="#4f46e5", text_label="emite factura")

# 6. CUENTAS_POR_PAGAR -> PAGOS_CUENTAS (1:N)
draw_relation((box_cxp['right'], box_cxp['top'] - 80), 
              (box_pagos['left'], box_pagos['top'] - 80),
              label1="1", label2="N", style="direct", color="#059669", text_label="recibe abonos")

# Legend box at bottom
legend_y = 75
ax.add_patch(FancyBboxPatch((60, legend_y), 1660, 55, boxstyle="round,pad=0,rounding_size=6",
                            facecolor='#ffffff', edgecolor='#cbd5e1', lw=1, zorder=2))

ax.text(80, legend_y + 27, "LEYENDA TÉCNICA:", fontsize=9, fontweight='bold', color='#1e293b', va='center')

# PK badge
ax.add_patch(FancyBboxPatch((210, legend_y + 19), 26, 16, boxstyle="round,pad=0,rounding_size=3", facecolor='#fef08a'))
ax.text(223, legend_y + 27, "PK", fontsize=8, fontweight='bold', color='#854d0e', ha='center', va='center')
ax.text(245, legend_y + 27, "Clave Primaria (SERIAL)", fontsize=8.5, color='#475569', va='center')

# FK badge
ax.add_patch(FancyBboxPatch((420, legend_y + 19), 26, 16, boxstyle="round,pad=0,rounding_size=3", facecolor='#cffafe'))
ax.text(433, legend_y + 27, "FK", fontsize=8, fontweight='bold', color='#0e7490', ha='center', va='center')
ax.text(455, legend_y + 27, "Clave Foránea (Relación)", fontsize=8.5, color='#475569', va='center')

# UK badge
ax.add_patch(FancyBboxPatch((625, legend_y + 19), 26, 16, boxstyle="round,pad=0,rounding_size=3", facecolor='#fce7f3'))
ax.text(638, legend_y + 27, "UK", fontsize=8, fontweight='bold', color='#be185d', ha='center', va='center')
ax.text(660, legend_y + 27, "Clave Única (UNIQUE)", fontsize=8.5, color='#475569', va='center')

# Cardinality
ax.text(830, legend_y + 27, "Cardinalidad:", fontsize=8.5, fontweight='bold', color='#1e293b', va='center')
ax.text(920, legend_y + 27, "1 = Uno / Entidad Fuerte", fontsize=8.5, color='#b91c1c', fontweight='bold', va='center')
ax.text(1080, legend_y + 27, "N = Muchos / Entidad Débil", fontsize=8.5, color='#1d4ed8', fontweight='bold', va='center')

ax.text(1300, legend_y + 27, "Base de Datos: PostgreSQL 18.1 (camadu_db) | Normalización: 3FN", 
        fontsize=8.5, color='#64748b', fontstyle='italic', va='center')

# Save PNG and SVG
import os
os.makedirs("frontend/img", exist_ok=True)
png_path = "frontend/img/diagrama_entidad_relacion.png"
svg_path = "frontend/img/diagrama_entidad_relacion.svg"

plt.tight_layout()
plt.savefig(png_path, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
plt.savefig(svg_path, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')

# Also save copy in root for thesis embedding
plt.savefig("diagrama_entidad_relacion.png", dpi=300, bbox_inches='tight')
plt.savefig("diagrama_entidad_relacion.svg", bbox_inches='tight')

print(f"Generated successfully:\n - {png_path}\n - {svg_path}\n - diagrama_entidad_relacion.png")
