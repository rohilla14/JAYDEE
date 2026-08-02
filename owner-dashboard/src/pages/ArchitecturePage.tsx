import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { clearStoredToken } from '../api/client'

type NodeType = 'frontend' | 'backend' | 'database' | 'external' | 'core'

type ArchNode = {
  id: string
  label: string
  type: NodeType
  hub?: boolean
  group: string
  summary: string
  details?: string[]
  endpoints?: string[]
  fields?: string[]
  routes?: string[]
  uses?: string[]
}

type ArchLink = {
  source: string
  target: string
  label?: string
}

type SimNode = ArchNode & d3.SimulationNodeDatum
type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string }

const ARCHITECTURE = {
  nodes: [
    // —— Frontends (apps) ——
    {
      id: 'employee-app',
      label: 'employee-app',
      type: 'frontend',
      group: 'App',
      summary: 'PWA for stock staff — barcode lookup and inventory adjust.',
      details: [
        'Port 5173 · Vite + React + TS + vite-plugin-pwa',
        'Auth: JWT in localStorage, ProtectedRoute',
        '401 → clear token + session flash; network → “Can’t reach server”',
        'Double-submit guard on stock +/- / Apply',
      ],
      routes: ['/login', '/stock'],
      uses: ['POST /auth/login', 'GET /products/barcode/{barcode}', 'PATCH /products/{id}/stock'],
    },
    {
      id: 'billing-app',
      label: 'billing-app',
      type: 'frontend',
      group: 'App',
      summary: 'Counter UI — cart stays client-side until Complete Sale.',
      details: [
        'Port 5174 · Vite + React + TS (no PWA)',
        'Tier display discounts: bronze 3% / silver 5% / gold 7% off MRP',
        'Cart not persisted — refresh = empty cart (expected)',
        'checkoutBusyRef prevents double POST /bills',
      ],
      routes: ['/login', '/counter'],
      uses: [
        'POST /auth/login',
        'GET /products/barcode/{barcode}',
        'GET /customers/phone/{phone}',
        'POST /customers',
        'POST /bills',
      ],
    },
    {
      id: 'owner-dashboard',
      label: 'owner-dashboard',
      type: 'frontend',
      group: 'App',
      hub: true,
      summary: 'Owner console — reports, catalog, staff, architecture map.',
      details: [
        'Port 5175 · owner role only (JWT role check + ProtectedRoute)',
        'Manual Refresh on dashboard (no auto-poll)',
        'Label PDF opened via auth-fetched blob (Bearer can’t go in window.open)',
      ],
      routes: ['/login', '/dashboard', '/products', '/staff', '/architecture'],
      uses: [
        'GET /reports/*',
        'GET|POST /products',
        'GET|POST /categories',
        'PATCH /products/{id}/stock',
        'GET /products/{id}/label-pdf',
        'GET /users',
        'POST /auth/register',
        'PATCH /users/{id}/deactivate',
      ],
    },

    // —— Frontend pages (detail leaves) ——
    {
      id: 'page-emp-stock',
      label: '/stock',
      type: 'frontend',
      group: 'employee-app page',
      summary: 'Scan or type barcode, show qty/threshold, adjust stock.',
      details: ['BarcodeDetector when available', 'Manual barcode fallback'],
      routes: ['/stock'],
    },
    {
      id: 'page-bill-counter',
      label: '/counter',
      type: 'frontend',
      group: 'billing-app page',
      summary: 'Scan into cart, optional customer, Complete Sale → receipt.',
      details: ['Stock cap warnings', 'New customer form on 404 phone lookup'],
      routes: ['/counter'],
    },
    {
      id: 'page-own-dash',
      label: '/dashboard',
      type: 'frontend',
      group: 'owner-dashboard page',
      summary: 'Daily sales, low-stock alerts, top products (7 days).',
      details: ['GET /reports/daily-sales|low-stock|top-products'],
      routes: ['/dashboard'],
    },
    {
      id: 'page-own-products',
      label: '/products',
      type: 'frontend',
      group: 'owner-dashboard page',
      summary: 'Catalog table, add product, categories, print labels, +/- stock.',
      details: ['Search via GET /products?search=', 'initial_quantity on create'],
      routes: ['/products'],
    },
    {
      id: 'page-own-staff',
      label: '/staff',
      type: 'frontend',
      group: 'owner-dashboard page',
      summary: 'List users, add staff, deactivate (not self).',
      details: ['POST /auth/register', 'PATCH /users/{id}/deactivate'],
      routes: ['/staff'],
    },
    {
      id: 'page-own-arch',
      label: '/architecture',
      type: 'frontend',
      group: 'owner-dashboard page',
      summary: 'This interactive system map (hardcoded graph data).',
      details: ['D3 force-directed; no live API introspection yet'],
      routes: ['/architecture'],
    },

    // —— Backend hub + core ——
    {
      id: 'fastapi',
      label: 'FastAPI backend',
      type: 'backend',
      hub: true,
      group: 'API',
      summary: 'shop-backend — JWT API on :8000 with CORS for the three Vite apps.',
      details: [
        'uvicorn app.main:app',
        'CORS: 5173 / 5174 / 5175 (+ LAN IP when demoing)',
        'Alembic migrations under alembic/versions/',
      ],
      endpoints: ['GET /health', 'GET /docs'],
    },
    {
      id: 'core-security',
      label: 'security.py',
      type: 'core',
      group: 'app/core',
      summary: 'Passwords, JWT, get_current_user, require_role.',
      details: [
        'bcrypt via passlib; JWT HS256, 8h, payload sub+role',
        'Inactive users rejected on login and on every authenticated request',
        'require_role(*roles) dependency factory',
      ],
    },
    {
      id: 'core-database',
      label: 'database.py',
      type: 'core',
      group: 'app/core',
      summary: 'SQLAlchemy engine + SessionLocal + get_db.',
      details: ['DATABASE_URL from settings', 'Declarative Base'],
    },
    {
      id: 'core-config',
      label: 'config.py',
      type: 'core',
      group: 'app/core',
      summary: 'pydantic-settings: DATABASE_URL, JWT_SECRET, WHATSAPP_PROVIDER.',
      details: ['Default WHATSAPP_PROVIDER=stub'],
    },
    {
      id: 'core-pricing',
      label: 'pricing.py',
      type: 'core',
      group: 'app/core',
      summary: 'Tier discounts, upgrade thresholds, points rate.',
      details: [
        'bronze 3% / silver 5% / gold 7% off MRP',
        'silver ≥ ₹5000 lifetime, gold ≥ ₹20000 (never downgrade)',
        'POINTS_PER_RUPEE = 0.10 (1 point per ₹10)',
      ],
    },
    {
      id: 'core-barcodes',
      label: 'barcodes.py',
      type: 'core',
      group: 'app/core',
      summary: 'Auto SHOP-{prefix}-{seq} with per-category advisory lock.',
      details: [
        'e.g. School Uniforms → SHOP-UNI-0001',
        'pg_advisory_xact_lock(category_id) + uniqueness check',
      ],
    },
    {
      id: 'core-labels',
      label: 'labels.py',
      type: 'core',
      group: 'app/core',
      summary: 'reportlab Code128 thermal + A4 bulk sheet PDFs.',
      details: ['Single ~50×30mm', 'Bulk tiles on A4 for office printers'],
    },
    {
      id: 'core-whatsapp',
      label: 'whatsapp.py',
      type: 'core',
      group: 'app/core',
      summary: 'send_whatsapp_message() — stub logs; real provider is one swap.',
      details: ['WHATSAPP_PROVIDER=stub|…', '_send_via_provider NotImplemented until wired'],
    },

    // —— Routers ——
    {
      id: 'router-auth',
      label: 'auth',
      type: 'backend',
      group: 'Router',
      summary: 'Login + owner-only staff registration.',
      details: ['Prefix /auth', 'Register requires owner JWT'],
      endpoints: ['POST /auth/register', 'POST /auth/login'],
    },
    {
      id: 'router-products',
      label: 'products',
      type: 'backend',
      group: 'Router',
      summary: 'Catalog, stock deltas, barcodes, label PDFs.',
      details: [
        'Create auto-generates barcode if omitted',
        'initial_quantity seeds inventory',
        'List returns ProductWithInventory',
      ],
      endpoints: [
        'POST /products',
        'GET /products',
        'GET /products/barcode/{barcode}',
        'GET /products/{id}',
        'PATCH /products/{id}/stock',
        'PATCH /products/bulk-threshold',
        'GET /products/{id}/label-pdf',
        'GET /products/labels-pdf?ids=',
      ],
    },
    {
      id: 'router-categories',
      label: 'categories',
      type: 'backend',
      group: 'Router',
      summary: 'Category list + create for product forms.',
      endpoints: ['GET /categories', 'POST /categories'],
    },
    {
      id: 'router-customers',
      label: 'customers',
      type: 'backend',
      group: 'Router',
      summary: 'Loyalty customers, WhatsApp opt-in, points redeem.',
      details: ['Redeem min 100 pts; 1 point = ₹1; not applied to bills yet'],
      endpoints: [
        'POST /customers',
        'GET /customers/phone/{phone}',
        'GET /customers/{id}',
        'PATCH /customers/{id}/whatsapp-opt-in',
        'POST /customers/{id}/redeem-points',
      ],
    },
    {
      id: 'router-billing',
      label: 'billing',
      type: 'backend',
      group: 'Router',
      summary: 'Atomic sale: stock, pricing, bill rows, loyalty.',
      details: [
        'Owner or billing_staff',
        '409 on stock race',
        'Tier pricing from pricing.py',
      ],
      endpoints: ['POST /bills'],
    },
    {
      id: 'router-reports',
      label: 'reports',
      type: 'backend',
      group: 'Router',
      summary: 'Owner-only SQL aggregations.',
      details: ['Asia/Kolkata day window for daily-sales'],
      endpoints: [
        'GET /reports/daily-sales',
        'GET /reports/low-stock',
        'GET /reports/top-products',
      ],
    },
    {
      id: 'router-users',
      label: 'users',
      type: 'backend',
      group: 'Router',
      summary: 'Staff directory + deactivate.',
      details: ['Cannot deactivate yourself', 'No password_hash in response'],
      endpoints: ['GET /users', 'PATCH /users/{id}/deactivate'],
    },
    {
      id: 'router-campaigns',
      label: 'campaigns',
      type: 'backend',
      group: 'Router',
      summary: 'Owner broadcast to opted-in customers (inline loop for now).',
      details: [
        'Always AND whatsapp_opt_in == true',
        'Filters: tier | all_opted_in',
        'TODO: background job at scale',
      ],
      endpoints: ['POST /campaigns/send'],
    },

    // —— Database ——
    {
      id: 'postgres',
      label: 'PostgreSQL',
      type: 'database',
      hub: true,
      group: 'Database',
      summary: 'shop_db — source of truth for all durable state.',
      details: ['SQLAlchemy 2 models', 'Alembic revisions'],
    },
    {
      id: 'table-users',
      label: 'users',
      type: 'database',
      group: 'Table',
      summary: 'Staff / owner accounts.',
      fields: [
        'id PK',
        'name',
        'phone',
        'password_hash',
        'role ENUM(owner|billing_staff|stock_staff)',
        'is_active BOOL default true',
        'created_at timestamptz',
      ],
      details: ['Bills.staff_id → users.id'],
    },
    {
      id: 'table-categories',
      label: 'categories',
      type: 'database',
      group: 'Table',
      summary: 'Product groupings (drives barcode prefix).',
      fields: ['id PK', 'name'],
      details: ['products.category_id → categories.id'],
    },
    {
      id: 'table-products',
      label: 'products',
      type: 'database',
      group: 'Table',
      summary: 'Catalog metadata (stock lives in inventory).',
      fields: [
        'id PK',
        'name',
        'category_id FK',
        'barcode UNIQUE nullable',
        'mrp Numeric(10,2)',
        'member_price Numeric(10,2)',
        'cost_price Numeric(10,2)',
        'created_at',
      ],
    },
    {
      id: 'table-inventory',
      label: 'inventory',
      type: 'database',
      group: 'Table',
      summary: '1:1 stock row per product.',
      fields: [
        'id PK',
        'product_id FK UNIQUE',
        'quantity',
        'reorder_threshold',
        'updated_at',
      ],
      details: ['PATCH stock uses quantity = quantity + delta in SQL'],
    },
    {
      id: 'table-customers',
      label: 'customers',
      type: 'database',
      group: 'Table',
      summary: 'Loyalty members + WhatsApp consent.',
      fields: [
        'id PK',
        'name',
        'phone UNIQUE',
        'tier ENUM(bronze|silver|gold)',
        'points_balance',
        'lifetime_spend Numeric(12,2)',
        'whatsapp_opt_in',
        'whatsapp_opt_in_at nullable',
        'created_at',
      ],
    },
    {
      id: 'table-bills',
      label: 'bills',
      type: 'database',
      group: 'Table',
      summary: 'Sale header.',
      fields: [
        'id PK',
        'customer_id FK nullable (walk-in)',
        'staff_id FK → users',
        'total_amount Numeric(12,2)',
        'discount_amount Numeric(12,2)',
        'created_at',
      ],
    },
    {
      id: 'table-bill-items',
      label: 'bill_items',
      type: 'database',
      group: 'Table',
      summary: 'Sale lines.',
      fields: [
        'id PK',
        'bill_id FK',
        'product_id FK',
        'quantity',
        'unit_price Numeric(10,2)',
        'line_total Numeric(12,2)',
      ],
    },

    // —— External ——
    {
      id: 'whatsapp',
      label: 'WhatsApp stub',
      type: 'external',
      group: 'External',
      summary: 'Provider placeholder — logs phone/template/params.',
      details: [
        'No Gupshup/Interakt call yet',
        'Campaigns + future transactional messages share send_whatsapp_message()',
      ],
    },
  ] satisfies ArchNode[],

  links: [
    // Apps → API
    { source: 'employee-app', target: 'fastapi', label: 'HTTP/JWT' },
    { source: 'billing-app', target: 'fastapi', label: 'HTTP/JWT' },
    { source: 'owner-dashboard', target: 'fastapi', label: 'HTTP/JWT' },

    // Pages → apps
    { source: 'page-emp-stock', target: 'employee-app' },
    { source: 'page-bill-counter', target: 'billing-app' },
    { source: 'page-own-dash', target: 'owner-dashboard' },
    { source: 'page-own-products', target: 'owner-dashboard' },
    { source: 'page-own-staff', target: 'owner-dashboard' },
    { source: 'page-own-arch', target: 'owner-dashboard' },

    // Apps → routers they primarily use
    { source: 'employee-app', target: 'router-auth' },
    { source: 'employee-app', target: 'router-products' },
    { source: 'billing-app', target: 'router-auth' },
    { source: 'billing-app', target: 'router-products' },
    { source: 'billing-app', target: 'router-customers' },
    { source: 'billing-app', target: 'router-billing' },
    { source: 'owner-dashboard', target: 'router-auth' },
    { source: 'owner-dashboard', target: 'router-reports' },
    { source: 'owner-dashboard', target: 'router-products' },
    { source: 'owner-dashboard', target: 'router-categories' },
    { source: 'owner-dashboard', target: 'router-users' },

    // Routers → FastAPI hub
    { source: 'router-auth', target: 'fastapi' },
    { source: 'router-products', target: 'fastapi' },
    { source: 'router-categories', target: 'fastapi' },
    { source: 'router-customers', target: 'fastapi' },
    { source: 'router-billing', target: 'fastapi' },
    { source: 'router-reports', target: 'fastapi' },
    { source: 'router-users', target: 'fastapi' },
    { source: 'router-campaigns', target: 'fastapi' },

    // Core → FastAPI / consumers
    { source: 'core-security', target: 'fastapi' },
    { source: 'core-database', target: 'fastapi' },
    { source: 'core-config', target: 'fastapi' },
    { source: 'core-pricing', target: 'router-billing' },
    { source: 'core-barcodes', target: 'router-products' },
    { source: 'core-labels', target: 'router-products' },
    { source: 'core-whatsapp', target: 'router-campaigns' },
    { source: 'core-security', target: 'router-auth' },
    { source: 'core-database', target: 'postgres' },

    // API → DB
    { source: 'fastapi', target: 'postgres', label: 'SQLAlchemy' },

    // Tables → Postgres
    { source: 'table-users', target: 'postgres' },
    { source: 'table-categories', target: 'postgres' },
    { source: 'table-products', target: 'postgres' },
    { source: 'table-inventory', target: 'postgres' },
    { source: 'table-customers', target: 'postgres' },
    { source: 'table-bills', target: 'postgres' },
    { source: 'table-bill-items', target: 'postgres' },

    // FK relationships
    { source: 'table-products', target: 'table-categories', label: 'category_id' },
    { source: 'table-inventory', target: 'table-products', label: 'product_id 1:1' },
    { source: 'table-bills', target: 'table-customers', label: 'customer_id?' },
    { source: 'table-bills', target: 'table-users', label: 'staff_id' },
    { source: 'table-bill-items', target: 'table-bills', label: 'bill_id' },
    { source: 'table-bill-items', target: 'table-products', label: 'product_id' },

    // Router → tables they touch
    { source: 'router-auth', target: 'table-users' },
    { source: 'router-users', target: 'table-users' },
    { source: 'router-categories', target: 'table-categories' },
    { source: 'router-products', target: 'table-products' },
    { source: 'router-products', target: 'table-inventory' },
    { source: 'router-customers', target: 'table-customers' },
    { source: 'router-billing', target: 'table-bills' },
    { source: 'router-billing', target: 'table-bill-items' },
    { source: 'router-billing', target: 'table-inventory' },
    { source: 'router-billing', target: 'table-customers' },
    { source: 'router-reports', target: 'table-bills' },
    { source: 'router-reports', target: 'table-bill-items' },
    { source: 'router-reports', target: 'table-inventory' },
    { source: 'router-campaigns', target: 'table-customers' },
    { source: 'router-campaigns', target: 'whatsapp' },
    { source: 'core-whatsapp', target: 'whatsapp' },
  ] satisfies ArchLink[],
}

const ALL_TYPES: NodeType[] = ['frontend', 'backend', 'core', 'database', 'external']

const TYPE_COLORS: Record<NodeType, { fill: string; stroke: string }> = {
  frontend: { fill: '#3b6ea5', stroke: '#2a4f78' },
  backend: { fill: '#6b4f3a', stroke: '#4a3526' },
  core: { fill: '#8a6238', stroke: '#5c4024' },
  database: { fill: '#2a7a6c', stroke: '#1d564c' },
  external: { fill: '#f3f1ec', stroke: '#8a8478' },
}

const TYPE_LAYER_X: Record<NodeType, number> = {
  frontend: 0.14,
  backend: 0.38,
  core: 0.55,
  database: 0.74,
  external: 0.9,
}

const NODE_BY_ID = Object.fromEntries(
  ARCHITECTURE.nodes.map((n) => [n.id, n]),
) as Record<string, ArchNode>

const DEGREE: Record<string, number> = {}
for (const link of ARCHITECTURE.links) {
  DEGREE[link.source] = (DEGREE[link.source] ?? 0) + 1
  DEGREE[link.target] = (DEGREE[link.target] ?? 0) + 1
}

function neighborsOf(id: string): Set<string> {
  const set = new Set<string>([id])
  for (const link of ARCHITECTURE.links) {
    if (link.source === id) set.add(link.target)
    if (link.target === id) set.add(link.source)
  }
  return set
}

function nodeRadius(node: ArchNode): number {
  if (node.hub) return 24
  if (node.group === 'App') return 16
  if (node.group === 'Router' || node.group === 'app/core') return 12
  return 10
}

function linkEndpoints(link: SimLink): { s: SimNode; t: SimNode } {
  return { s: link.source as SimNode, t: link.target as SimNode }
}

type LayoutMode = 'force' | 'layers'
type TooltipState = { id: string; x: number; y: number } | null

type GraphHandles = {
  zoomBy: (factor: number) => void
  resetView: () => void
  focusNode: (id: string) => void
  setLayout: (mode: LayoutMode) => void
  applyVisual: () => void
  syncPins: () => void
}

export function ArchitecturePage() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const handlesRef = useRef<GraphHandles | null>(null)
  const pinnedRef = useRef<Set<string>>(new Set())
  const visualRef = useRef({
    selectedId: null as string | null,
    hoveredId: null as string | null,
    search: '',
    enabledTypes: new Set<NodeType>(ALL_TYPES),
    focusMode: true,
    showLinkLabels: true,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(
    () => new Set(ALL_TYPES),
  )
  const [layout, setLayout] = useState<LayoutMode>('force')
  const [focusMode, setFocusMode] = useState(true)
  const [showLinkLabels, setShowLinkLabels] = useState(true)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set())
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const selected = selectedId ? NODE_BY_ID[selectedId] ?? null : null

  const selectedConnections = useMemo(() => {
    if (!selectedId) return []
    const out: { otherId: string; otherLabel: string; label?: string; dir: 'out' | 'in' }[] = []
    for (const link of ARCHITECTURE.links) {
      if (link.source === selectedId) {
        const other = NODE_BY_ID[link.target]
        if (other) out.push({ otherId: other.id, otherLabel: other.label, label: link.label, dir: 'out' })
      } else if (link.target === selectedId) {
        const other = NODE_BY_ID[link.source]
        if (other) out.push({ otherId: other.id, otherLabel: other.label, label: link.label, dir: 'in' })
      }
    }
    return out
  }, [selectedId])

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return new Set<string>()
    return new Set(
      ARCHITECTURE.nodes
        .filter((n) => {
          const hay = [
            n.id,
            n.label,
            n.group,
            n.summary,
            ...(n.endpoints ?? []),
            ...(n.fields ?? []),
            ...(n.routes ?? []),
            ...(n.uses ?? []),
            ...(n.details ?? []),
          ]
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
        .map((n) => n.id),
    )
  }, [search])

  // Keep visual ref in sync for D3 without recreating simulation
  useEffect(() => {
    visualRef.current = {
      selectedId,
      hoveredId,
      search,
      enabledTypes,
      focusMode,
      showLinkLabels,
    }
    pinnedRef.current = pinnedIds
    handlesRef.current?.syncPins()
    handlesRef.current?.applyVisual()
  }, [selectedId, hoveredId, search, enabledTypes, focusMode, showLinkLabels, pinnedIds])

  useEffect(() => {
    handlesRef.current?.setLayout(layout)
  }, [layout])

  useEffect(() => {
    const svgEl = svgRef.current
    const wrapEl = wrapRef.current
    if (!svgEl || !wrapEl) return

    const width = Math.max(wrapEl.clientWidth, 720)
    const height = Math.max(680, Math.min(920, window.innerHeight - 200))

    const nodes: SimNode[] = ARCHITECTURE.nodes.map((n) => ({ ...n }))
    const links: SimLink[] = ARCHITECTURE.links.map((l) => ({ ...l }))

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height)

    const defs = svg.append('defs')
    defs
      .append('marker')
      .attr('id', 'arch-arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#8a8074')

    const pulse = defs
      .append('radialGradient')
      .attr('id', 'arch-pulse')
    pulse.append('stop').attr('offset', '0%').attr('stop-color', '#c4a574').attr('stop-opacity', 0.55)
    pulse.append('stop').attr('offset', '100%').attr('stop-color', '#c4a574').attr('stop-opacity', 0)

    const g = svg.append('g').attr('class', 'arch-world')

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })
    svg.call(zoom)

    const linkForce = d3
      .forceLink<SimNode, SimLink>(links)
      .id((d) => d.id)
      .distance((d) => {
        const s = d.source as SimNode
        const t = d.target as SimNode
        if (s.hub || t.hub) return 120
        if (s.group === 'App' || t.group === 'App') return 100
        return 78
      })
      .strength(0.42)

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force('link', linkForce)
      .force('charge', d3.forceManyBody().strength(-340))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 16))
      .alpha(1)
      .alphaDecay(0.02)

    let currentLayout: LayoutMode = 'force'

    function applyLayoutForces(mode: LayoutMode) {
      currentLayout = mode
      if (mode === 'layers') {
        simulation
          .force(
            'x',
            d3
              .forceX<SimNode>((d) => TYPE_LAYER_X[d.type] * width)
              .strength(0.55),
          )
          .force('y', d3.forceY(height / 2).strength(0.05))
          .force('charge', d3.forceManyBody().strength(-220))
      } else {
        simulation.force('x', null).force('y', null)
        simulation.force('charge', d3.forceManyBody().strength(-340))
      }
      simulation.alpha(0.85).restart()
    }

    const linkG = g.append('g').attr('class', 'arch-links')
    const link = linkG
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#b7aea0')
      .attr('stroke-width', 1.15)
      .attr('stroke-opacity', 0.7)
      .attr('marker-end', 'url(#arch-arrow)')

    const linkLabelG = g.append('g').attr('class', 'arch-link-labels')
    const linkLabel = linkLabelG
      .selectAll('text')
      .data(links.filter((l) => Boolean(l.label)))
      .join('text')
      .attr('class', 'arch-link-label')
      .text((d) => d.label ?? '')
      .attr('font-size', 8)
      .attr('fill', '#6b645a')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    const node = g
      .append('g')
      .attr('class', 'arch-nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab')
      .attr('data-id', (d) => d.id)

    node
      .append('circle')
      .attr('class', 'arch-halo')
      .attr('r', (d) => nodeRadius(d) + 8)
      .attr('fill', 'url(#arch-pulse)')
      .attr('opacity', 0)

    node
      .append('circle')
      .attr('class', 'arch-dot')
      .attr('r', (d) => nodeRadius(d))
      .attr('fill', (d) => TYPE_COLORS[d.type].fill)
      .attr('stroke', (d) => TYPE_COLORS[d.type].stroke)
      .attr('stroke-width', (d) => (d.type === 'external' ? 2 : 1.5))
      .attr('stroke-dasharray', (d) => (d.type === 'external' ? '4 3' : null))

    node
      .append('text')
      .attr('class', 'arch-pin')
      .text('📌')
      .attr('x', (d) => nodeRadius(d) - 2)
      .attr('y', (d) => -nodeRadius(d) + 2)
      .attr('font-size', 9)
      .attr('opacity', 0)
      .attr('pointer-events', 'none')

    node
      .append('text')
      .attr('class', 'arch-label')
      .text((d) => d.label)
      .attr('x', 0)
      .attr('y', (d) => nodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#3a342c')
      .attr('pointer-events', 'none')

    node
      .append('title')
      .text((d) => `${d.label} — ${d.summary}`)

    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        if (!pinnedRef.current.has(d.id)) {
          d.fx = null
          d.fy = null
        }
      })

    node.call(drag)

    node
      .on('mouseenter', (event, d) => {
        setHoveredId(d.id)
        const rect = wrapEl.getBoundingClientRect()
        setTooltip({
          id: d.id,
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top + 12,
        })
      })
      .on('mousemove', (event) => {
        const rect = wrapEl.getBoundingClientRect()
        setTooltip((prev) =>
          prev
            ? {
                ...prev,
                x: event.clientX - rect.left + 12,
                y: event.clientY - rect.top + 12,
              }
            : prev,
        )
      })
      .on('mouseleave', () => {
        setHoveredId(null)
        setTooltip(null)
      })
      .on('click', (event, d) => {
        event.stopPropagation()
        setSelectedId(d.id)
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation()
        setPinnedIds((prev) => {
          const next = new Set(prev)
          if (next.has(d.id)) {
            next.delete(d.id)
            d.fx = null
            d.fy = null
          } else {
            next.add(d.id)
            d.fx = d.x ?? null
            d.fy = d.y ?? null
          }
          return next
        })
      })

    svg.on('click', () => setSelectedId(null))

    function applyVisual() {
      const v = visualRef.current
      const q = v.search.trim().toLowerCase()
      const hits = q
        ? new Set(
            ARCHITECTURE.nodes
              .filter((n) => {
                const hay = [
                  n.id,
                  n.label,
                  n.group,
                  n.summary,
                  ...(n.endpoints ?? []),
                  ...(n.fields ?? []),
                  ...(n.routes ?? []),
                  ...(n.uses ?? []),
                  ...(n.details ?? []),
                ]
                  .join(' ')
                  .toLowerCase()
                return hay.includes(q)
              })
              .map((n) => n.id),
          )
        : null

      const focusId = v.hoveredId ?? v.selectedId
      const neighborhood =
        focusId && v.focusMode ? neighborsOf(focusId) : null

      node.attr('opacity', (d) => {
        if (!v.enabledTypes.has(d.type)) return 0.08
        if (hits && !hits.has(d.id)) return 0.12
        if (neighborhood && !neighborhood.has(d.id)) return 0.12
        return 1
      })

      node
        .select('.arch-halo')
        .attr('opacity', (d) => (d.id === v.selectedId ? 1 : 0))
        .classed('is-pulsing', (d) => d.id === v.selectedId)

      node
        .select('.arch-dot')
        .attr('stroke-width', (d) => {
          if (d.id === v.selectedId) return 3.2
          if (hits?.has(d.id)) return 2.6
          return d.type === 'external' ? 2 : 1.5
        })
        .attr('filter', (d) =>
          d.id === v.selectedId || hits?.has(d.id)
            ? 'drop-shadow(0 0 4px rgba(90,70,40,0.35))'
            : null,
        )

      node.select('.arch-pin').attr('opacity', (d) => (pinnedRef.current.has(d.id) ? 1 : 0))

      link
        .attr('stroke-opacity', (d) => {
          const { s, t } = linkEndpoints(d)
          if (!v.enabledTypes.has(s.type) || !v.enabledTypes.has(t.type)) return 0.04
          if (hits && !hits.has(s.id) && !hits.has(t.id)) return 0.05
          if (neighborhood) {
            const on = neighborhood.has(s.id) && neighborhood.has(t.id)
            return on ? 1 : 0.04
          }
          return 0.7
        })
        .attr('stroke-width', (d) => {
          const { s, t } = linkEndpoints(d)
          if (neighborhood && neighborhood.has(s.id) && neighborhood.has(t.id)) return 2.2
          return 1.15
        })
        .attr('stroke', (d) => {
          const { s, t } = linkEndpoints(d)
          if (neighborhood && neighborhood.has(s.id) && neighborhood.has(t.id)) return '#6b5340'
          return '#b7aea0'
        })
        .classed('is-flowing', (d) => {
          if (!neighborhood) return false
          const { s, t } = linkEndpoints(d)
          return neighborhood.has(s.id) && neighborhood.has(t.id)
        })

      linkLabel.attr('opacity', (d) => {
        if (!v.showLinkLabels) return 0
        const { s, t } = linkEndpoints(d)
        if (!v.enabledTypes.has(s.type) || !v.enabledTypes.has(t.type)) return 0
        if (neighborhood) {
          return neighborhood.has(s.id) && neighborhood.has(t.id) ? 1 : 0
        }
        if (v.hoveredId && (s.id === v.hoveredId || t.id === v.hoveredId)) return 1
        return 0
      })
    }

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => linkEndpoints(d).s.x ?? 0)
        .attr('y1', (d) => linkEndpoints(d).s.y ?? 0)
        .attr('x2', (d) => {
          const { s, t } = linkEndpoints(d)
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.hypot(dx, dy) || 1
          const pad = nodeRadius(t) + 4
          return (t.x ?? 0) - (dx / dist) * pad
        })
        .attr('y2', (d) => {
          const { s, t } = linkEndpoints(d)
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.hypot(dx, dy) || 1
          const pad = nodeRadius(t) + 4
          return (t.y ?? 0) - (dy / dist) * pad
        })

      linkLabel
        .attr('x', (d) => {
          const { s, t } = linkEndpoints(d)
          return ((s.x ?? 0) + (t.x ?? 0)) / 2
        })
        .attr('y', (d) => {
          const { s, t } = linkEndpoints(d)
          return ((s.y ?? 0) + (t.y ?? 0)) / 2 - 4
        })

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    handlesRef.current = {
      zoomBy: (factor) => {
        svg.transition().duration(220).call(zoom.scaleBy, factor)
      },
      resetView: () => {
        svg.transition().duration(320).call(zoom.transform, d3.zoomIdentity)
        applyLayoutForces(currentLayout)
      },
      focusNode: (id) => {
        const n = nodes.find((x) => x.id === id)
        if (!n || n.x == null || n.y == null) return
        const scale = 1.35
        const transform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-n.x, -n.y)
        svg.transition().duration(450).call(zoom.transform, transform)
      },
      setLayout: (mode) => applyLayoutForces(mode),
      applyVisual,
      syncPins: () => {
        for (const n of nodes) {
          if (pinnedRef.current.has(n.id)) {
            n.fx = n.x ?? n.fx ?? null
            n.fy = n.y ?? n.fy ?? null
          } else if (n.fx != null || n.fy != null) {
            // leave alone while actively dragging; clear when not pinned
            n.fx = null
            n.fy = null
          }
        }
      },
    }

    applyVisual()

    return () => {
      simulation.stop()
      handlesRef.current = null
      svg.on('click', null)
      svg.on('.zoom', null)
      svg.selectAll('*').remove()
    }
  }, [])

  const toggleType = useCallback((t: NodeType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) {
        if (next.size === 1) return prev
        next.delete(t)
      } else {
        next.add(t)
      }
      return next
    })
  }, [])

  function selectAndFocus(id: string) {
    setSelectedId(id)
    handlesRef.current?.focusNode(id)
  }

  function jumpToSearch() {
    const first = [...searchHits][0]
    if (first) selectAndFocus(first)
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      jumpToSearch()
    }
    if (e.key === 'Escape') {
      setSearch('')
      ;(e.target as HTMLInputElement).blur()
    }
  }

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
        setTooltip(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  const tooltipNode = tooltip ? NODE_BY_ID[tooltip.id] : null

  return (
    <main className="dashboard architecture-page">
      <header className="page-header">
        <div>
          <h1>Architecture</h1>
          <p className="subtitle">
            Explore the whole system — search, filter, pin, and follow connections.
          </p>
        </div>
        <div className="header-actions">
          <Link className="secondary link-btn" to="/dashboard">
            Dashboard
          </Link>
          <Link className="secondary link-btn" to="/products">
            Products
          </Link>
          <Link className="secondary link-btn" to="/staff">
            Staff
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="panel architecture-panel">
        <div className="architecture-toolbar">
          <div className="architecture-search">
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search nodes, endpoints, columns…  (/)"
              aria-label="Search architecture"
            />
            {search ? (
              <span className="architecture-search-meta muted">
                {searchHits.size} hit{searchHits.size === 1 ? '' : 's'}
                {searchHits.size > 0 ? (
                  <button type="button" className="linkish" onClick={jumpToSearch}>
                    Jump
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="architecture-filters" role="group" aria-label="Filter by type">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-chip${enabledTypes.has(t) ? ' is-on' : ''}`}
                data-type={t}
                onClick={() => toggleType(t)}
              >
                <i className={`swatch swatch-${t}`} />
                {t}
              </button>
            ))}
          </div>

          <div className="architecture-controls">
            <button
              type="button"
              className={`secondary${layout === 'force' ? ' is-active' : ''}`}
              onClick={() => setLayout('force')}
            >
              Force
            </button>
            <button
              type="button"
              className={`secondary${layout === 'layers' ? ' is-active' : ''}`}
              onClick={() => setLayout('layers')}
            >
              Layers
            </button>
            <button
              type="button"
              className={`secondary${focusMode ? ' is-active' : ''}`}
              onClick={() => setFocusMode((v) => !v)}
              title="Dim everything except the selected/hovered neighborhood"
            >
              Focus
            </button>
            <button
              type="button"
              className={`secondary${showLinkLabels ? ' is-active' : ''}`}
              onClick={() => setShowLinkLabels((v) => !v)}
            >
              Labels
            </button>
            <span className="toolbar-sep" aria-hidden="true" />
            <button type="button" className="secondary" onClick={() => handlesRef.current?.zoomBy(1.25)}>
              +
            </button>
            <button type="button" className="secondary" onClick={() => handlesRef.current?.zoomBy(0.8)}>
              −
            </button>
            <button type="button" className="secondary" onClick={() => handlesRef.current?.resetView()}>
              Reset
            </button>
          </div>
        </div>

        <div className="architecture-legend" aria-hidden="true">
          <span className="muted">
            {ARCHITECTURE.nodes.length} nodes · {ARCHITECTURE.links.length} links
            {pinnedIds.size ? ` · ${pinnedIds.size} pinned` : ''}
          </span>
          <span className="muted">
            Click select · double-click pin · scroll zoom · drag rearrange
          </span>
        </div>

        <div className="architecture-layout">
          <div className="architecture-stage" ref={wrapRef}>
            <svg
              ref={svgRef}
              className="architecture-svg"
              role="img"
              aria-label="System architecture graph"
            />
            {tooltipNode ? (
              <div
                className="architecture-tooltip"
                style={{ left: tooltip!.x, top: tooltip!.y }}
                role="tooltip"
              >
                <strong>{tooltipNode.label}</strong>
                <span className={`pill pill-${tooltipNode.type}`}>{tooltipNode.type}</span>
                <p>{tooltipNode.summary}</p>
                <p className="muted">
                  {DEGREE[tooltipNode.id] ?? 0} connections · {tooltipNode.group}
                </p>
              </div>
            ) : null}
            <p className="architecture-hint muted">
              Esc clears selection · / focuses search
            </p>
          </div>

          <aside className="architecture-detail-panel" aria-live="polite">
            {selected ? (
              <>
                <p className="architecture-detail-label">{selected.label}</p>
                <p className="architecture-meta">
                  <span className={`pill pill-${selected.type}`}>{selected.type}</span>
                  <span className="muted">{selected.group}</span>
                  {selected.hub ? <span className="muted">· hub</span> : null}
                  <span className="muted">· {DEGREE[selected.id] ?? 0} links</span>
                </p>
                <p className="architecture-summary">{selected.summary}</p>

                <div className="architecture-detail-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handlesRef.current?.focusNode(selected.id)}
                  >
                    Zoom to
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setPinnedIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(selected.id)) next.delete(selected.id)
                        else next.add(selected.id)
                        return next
                      })
                      handlesRef.current?.applyVisual()
                    }}
                  >
                    {pinnedIds.has(selected.id) ? 'Unpin' : 'Pin'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
                    Close
                  </button>
                </div>

                {selectedConnections.length > 0 ? (
                  <div className="architecture-block">
                    <h3>Connected to</h3>
                    <div className="neighbor-chips">
                      {selectedConnections.map((c) => (
                        <button
                          key={`${c.dir}-${c.otherId}-${c.label ?? ''}`}
                          type="button"
                          className="neighbor-chip"
                          onClick={() => selectAndFocus(c.otherId)}
                          title={c.label ? `${c.dir}: ${c.label}` : c.dir}
                        >
                          <span className="neighbor-dir">{c.dir === 'out' ? '→' : '←'}</span>
                          {c.otherLabel}
                          {c.label ? <span className="neighbor-edge">{c.label}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.details?.length ? (
                  <DetailBlock title="Notes" items={selected.details} />
                ) : null}
                {selected.routes?.length ? (
                  <DetailBlock title="Frontend routes" items={selected.routes} mono />
                ) : null}
                {selected.endpoints?.length ? (
                  <DetailBlock title="API endpoints" items={selected.endpoints} mono />
                ) : null}
                {selected.uses?.length ? (
                  <DetailBlock title="Calls" items={selected.uses} mono />
                ) : null}
                {selected.fields?.length ? (
                  <DetailBlock title="Columns" items={selected.fields} mono />
                ) : null}
              </>
            ) : (
              <>
                <p className="architecture-detail-label">Explore</p>
                <p className="muted">
                  Click a node for full detail. Use Focus to isolate its neighborhood,
                  Layers to line up by type, and search to jump to endpoints or columns.
                </p>
                <div className="architecture-block">
                  <h3>Quick jump</h3>
                  <div className="neighbor-chips">
                    {['employee-app', 'billing-app', 'owner-dashboard', 'fastapi', 'postgres', 'router-billing'].map(
                      (id) => (
                        <button
                          key={id}
                          type="button"
                          className="neighbor-chip"
                          onClick={() => selectAndFocus(id)}
                        >
                          {NODE_BY_ID[id]?.label ?? id}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}

function DetailBlock({
  title,
  items,
  mono = false,
}: {
  title: string
  items: string[]
  mono?: boolean
}) {
  return (
    <div className="architecture-block">
      <h3>{title}</h3>
      <ul className={mono ? 'mono-list' : undefined}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
