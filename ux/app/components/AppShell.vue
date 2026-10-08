<script setup lang="ts">
import { attentionCount } from '#shared/vm-pane'
const route = useRoute()
const { plane } = usePlane()
const attention = computed(() => attentionCount(plane.value?.instances ?? []))
const nav = computed(() => [
  { to: '/', label: 'Fleet', icon: 'fleet', active: route.path === '/' },
  { to: '/layers', label: 'Layers', icon: 'layers', active: route.path === '/layers' },
  { to: '/engines', label: 'Engines', icon: 'engines', active: route.path === '/engines' },
  { to: '/machines', label: 'Virtual machines', icon: 'vms', active: route.path === '/machines' || route.path.startsWith('/instances'), badge: attention.value },
  ...(plane.value?.frontDoor ? [{ to: '/front-door', label: 'Front door', icon: 'door', active: route.path === '/front-door' }] : []),
])
// One swatch per state colour, named once (no state depends on colour alone).
const indicatorKey = [
  { tone: 'pass', label: 'Provisioned (Terraform) · Healthy · Converged (Ansible) · Secured' },
  { tone: 'warn', label: 'Attention · Outdated' },
  { tone: 'fail', label: 'Not ready · Down · Failed' },
  { tone: 'unknown', label: 'Unknown · Never run' },
  { tone: 'seal', label: 'Seal Vault' },
  { tone: 'service', label: 'Service VM' },
] as const
const { session } = useAuth()
const person = computed(() => session.value?.authenticated ? session.value : null)

const chain = computed(() => {
  const value = plane.value?.sealChain
  if (!plane.value?.available) return { tone: 'unknown', label: 'Multipass unavailable' }
  if (!value) return { tone: 'unknown', label: 'Seal chain: checking' }
  if (value.sealVault.status === 'fail') return { tone: 'critical', label: 'Seal Vault sealed' }
  if (value.sealVault.status !== 'pass') return { tone: 'unknown', label: 'Seal Vault unknown' }
  const ok = value.links.filter(link => link.status === 'pass').length
  return { tone: ok === value.links.length && ok > 0 ? 'healthy' : 'degraded', label: `Seal chain ${ok}/${value.links.length}` }
})
const mode = computed(() => plane.value?.mode ?? 'host')
const title = computed(() => route.path.startsWith('/instances/')
  ? decodeURIComponent(String(route.params.name || 'Instance'))
  : route.path === '/machines' ? 'Virtual machines' : route.path === '/engines' ? 'Engines' : route.path === '/layers' ? 'Layers' : route.path === '/front-door' ? 'Front door' : 'Fleet')
</script>

<template>
  <div class="vg-shell">
    <aside class="vg-sidebar" aria-label="Primary">
      <div class="sidebar-inner">
      <NuxtLink to="/" class="sidebar-brand" aria-label="golden_ticket home">
        <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M15.6 9.4A4 4 0 1 0 16 13.2V12h-3.2" fill="none" style="stroke: var(--vg-action-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="brand-name">golden_ticket</span>
      </NuxtLink>
      <nav class="sidebar-nav" aria-label="Primary navigation">
        <NuxtLink v-for="item in nav" :key="item.to" :to="item.to" class="nav-item" :class="{ active: item.active }" :aria-current="item.active ? 'page' : undefined">
          <span class="nav-icon">
            <svg v-if="item.icon === 'fleet'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
            <svg v-else-if="item.icon === 'layers'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
            <svg v-else-if="item.icon === 'engines'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2" /></svg>
            <svg v-else-if="item.icon === 'vms'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M14 12h.01" /></svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.badge" class="nav-badge" :aria-label="`${item.badge} need attention`">{{ item.badge }}</span>
        </NuxtLink>
      </nav>
      <section class="indicator-key" aria-labelledby="indicator-key-title">
        <h2 id="indicator-key-title">Indicator key</h2>
        <ul>
          <li v-for="k in indicatorKey" :key="k.tone"><span class="key-swatch" :class="`key-${k.tone}`" aria-hidden="true" />{{ k.label }}</li>
        </ul>
      </section>
      <div class="sidebar-footer">
        <p class="foot-title">Local control plane</p>
        <p class="foot-meta">{{ mode === 'vm' ? 'gt-ux-1 · observe-only' : '127.0.0.1 · host console' }}</p>
        <p class="foot-meta">Terraform builds it, Ansible decorates it; this view observes both.</p>
      </div>
      </div>
    </aside>

    <div class="vg-main">
      <div class="topbar-wrap">
        <header class="vg-topbar">
          <div class="topbar-left">
            <NuxtLink to="/" class="mobile-brand" aria-label="golden_ticket home">golden_ticket</NuxtLink>
            <p class="page-title">{{ title }}</p>
            <nav class="mobile-nav" aria-label="Sections">
              <NuxtLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ active: item.active }" :aria-current="item.active ? 'page' : undefined">{{ item.label === 'Virtual machines' ? 'VMs' : item.label }}</NuxtLink>
            </nav>
          </div>
          <div class="topbar-right">
            <span class="cluster-pill" :class="chain.tone" role="status">
              <span class="cluster-dot" :class="{ live: chain.tone === 'healthy' }" />
              <span class="cluster-label">{{ chain.label }}</span>
            </span>
            <span v-if="person" class="persona">
              <span class="persona-dot" aria-hidden="true" />
              <span class="persona-name">{{ person.user }}</span>
              <span class="persona-role">{{ person.role }}</span>
              <a class="persona-out" href="/auth/logout">Sign out</a>
            </span>
            <span class="env-badge" :title="mode === 'vm' ? 'Running inside gt-ux-1: observe-only' : 'Running on the host next to Multipass'">{{ mode === 'vm' ? 'VM' : 'HOST' }}</span>
          </div>
        </header>
      </div>
      <main id="main" class="vg-content">
        <slot />
      </main>
      <GoldenTicketFooter />
    </div>
  </div>
</template>

<style scoped>
.vg-shell { display: flex; min-height: 100vh; }

.vg-sidebar {
  width: var(--sidebar-w);
  background: var(--vg-bg-shell);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border-right: 1px solid var(--vg-glass-border);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.6), 8px 0 32px -24px rgba(15, 26, 42, 0.35);
  flex-shrink: 0; align-self: stretch;
}
.sidebar-inner { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; }
.sidebar-brand {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  height: var(--topbar-h); border-bottom: 1px solid var(--vg-border-subtle);
  color: var(--vg-text-primary);
}
.brand-icon { width: 24px; height: 24px; flex-shrink: 0; }
.brand-name { font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: var(--vg-text-primary); }
.sidebar-nav { flex: 1; padding: 12px 0; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; margin: 0 8px; padding: 0 10px; height: 36px;
  font-size: 13px; font-weight: 550; color: var(--vg-text-secondary); border-radius: 8px;
  transition: background 0.18s var(--vg-ease-out), color 0.18s, box-shadow 0.18s;
}
.nav-item:hover { background: rgba(255, 255, 255, 0.55); color: var(--vg-text-primary); }
.nav-item.active {
  background: rgba(255, 255, 255, 0.85); color: var(--vg-text-primary); font-weight: 650;
  box-shadow: inset 0 0 0 1px rgba(15, 26, 42, 0.08), 0 4px 12px -8px rgba(15, 26, 42, 0.35);
}
.nav-item.active .nav-icon { color: var(--vg-action-primary); }
.nav-icon { width: 16px; height: 16px; display: flex; }
.nav-icon svg { width: 16px; height: 16px; }
.nav-badge { min-width: 18px; padding: 0 6px; border-radius: 100px; text-align: center; font-size: 10.5px; font-weight: 700; line-height: 18px; background: var(--vg-pending-bg); color: var(--vg-pending); border: 1px solid color-mix(in srgb, var(--vg-hue-amber) 30%, transparent); }
.indicator-key { margin: 0 12px 12px; padding: 10px 12px; border-radius: 10px; background: var(--vg-well); border: 1px solid var(--vg-border-subtle); }
.indicator-key h2 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--vg-text-muted); }
.indicator-key ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.indicator-key li { display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; line-height: 1.35; color: var(--vg-text-secondary); }
.key-swatch { width: 9px; height: 9px; margin-top: 3px; border-radius: 3px; flex-shrink: 0; }
.key-pass { background: var(--vg-healthy); }
.key-warn { background: var(--vg-pending); }
.key-fail { background: var(--vg-critical); }
.key-unknown { background: var(--vg-text-dim); }
.key-seal { background: var(--vg-hue-violet); }
.key-service { background: var(--vg-info); }
.mobile-nav { display: none; gap: 4px; }
.mobile-nav a { padding: 4px 9px; border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--vg-text-secondary); }
.mobile-nav a.active { background: rgba(255, 255, 255, 0.85); color: var(--vg-text-primary); box-shadow: inset 0 0 0 1px rgba(15, 26, 42, 0.08); }
.sidebar-footer { padding: 14px 16px; border-top: 1px solid var(--vg-border-subtle); }
.foot-title { margin: 0; font-size: 12px; font-weight: 650; color: var(--vg-text-secondary); }
.foot-meta { margin: 2px 0 0; font-size: 11.5px; color: var(--vg-text-muted); line-height: 1.45; }

.vg-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar-wrap { position: sticky; top: 0; z-index: 10; padding: 12px 24px 0; }
.vg-topbar {
  height: var(--topbar-h);
  background: var(--vg-bg-shell);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--vg-glass-border); border-radius: 14px;
  box-shadow: var(--vg-shadow-md), inset 0 1px 0 var(--vg-glass-hi);
  display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 20px;
}
.topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.page-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--vg-text-primary); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mobile-brand { display: none; font-weight: 800; letter-spacing: -0.02em; color: var(--vg-text-primary); }
.topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cluster-pill { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
.cluster-pill.healthy { background: var(--vg-healthy-bg); color: var(--vg-healthy); border: 1px solid color-mix(in srgb, var(--vg-hue-green) 22%, transparent); }
.cluster-pill.degraded { background: var(--vg-pending-bg); color: var(--vg-pending); border: 1px solid color-mix(in srgb, var(--vg-hue-amber) 28%, transparent); }
.cluster-pill.critical { background: var(--vg-critical-bg); color: var(--vg-critical); border: 1px solid color-mix(in srgb, var(--vg-hue-red) 22%, transparent); }
.cluster-pill.unknown { background: color-mix(in srgb, var(--vg-hue-slate) 10%, transparent); color: var(--vg-text-muted); border: 1px solid color-mix(in srgb, var(--vg-hue-slate) 20%, transparent); }
.cluster-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.cluster-dot.live { animation: vgPulse 2.4s ease infinite; box-shadow: 0 0 8px currentColor; }
.persona { display: flex; align-items: center; gap: 7px; padding: 3px 4px 3px 10px; border: 1px solid var(--vg-glass-border); border-radius: 100px; font-size: 12px; color: var(--vg-text-secondary); }
.persona-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vg-action-bright); box-shadow: 0 0 0 2px color-mix(in srgb, var(--vg-hue-blue) 18%, transparent); }
.persona-name { font-weight: 650; color: var(--vg-text-primary); }
.persona-role { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--vg-action-bright); }
.persona-out { padding: 2px 9px; border-radius: 100px; font-weight: 600; color: var(--vg-text-secondary); background: var(--vg-hover); }
.persona-out:hover { color: var(--vg-text-primary); }
.env-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: var(--vg-text-muted); border: 1px solid var(--vg-glass-border); border-radius: 5px; padding: 3px 8px; }
.vg-content { flex: 1; padding: 20px 24px 40px; min-width: 0; }

@media (max-width: 900px) {
  .vg-sidebar { display: none; }
  /* Brand + status on the first row, the section nav on its own row. */
  .vg-topbar { height: auto; flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; row-gap: 6px; }
  .topbar-left { display: contents; }
  .mobile-nav { display: flex; order: 3; flex-basis: 100%; }
  .mobile-brand { display: inline; }
  .page-title { display: none; }
}
@media (max-width: 640px) {
  .persona-name, .persona-dot { display: none; }
  .topbar-wrap { padding: 10px 16px 0; }
  .vg-topbar { padding: 0 14px; }
  .env-badge { display: none; }
  .vg-content { padding: 16px 16px 32px; }
}
</style>
