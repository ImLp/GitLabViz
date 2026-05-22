<template>
  <v-app-bar density="compact" elevation="1">
    <v-app-bar-nav-icon @click="$emit('close')" title="Back" icon="mdi-arrow-left" />
    <v-app-bar-title>Flake History</v-app-bar-title>
    <v-spacer />
    <v-select
      v-if="filterOptions.suites.length > 1"
      v-model="suiteFilter"
      :items="['(all)', ...filterOptions.suites]"
      density="compact" hide-details variant="underlined"
      style="max-width: 160px"
      label="Suite"
    />
    <v-select
      v-if="filterOptions.gfxApis.length > 1"
      v-model="gfxFilter"
      :items="['(all)', ...filterOptions.gfxApis]"
      density="compact" hide-details variant="underlined"
      style="max-width: 140px"
      label="Gfx"
    />
    <v-slider
      v-if="bundle"
      v-model="lastNRuns"
      :min="5" :max="100" :step="1"
      hide-details density="compact"
      style="max-width: 200px"
      :label="`Last ${lastNRuns} runs`"
    />
    <v-btn icon @click="reload" :loading="loading" title="Refresh now" class="mr-2">
      <v-icon icon="mdi-refresh" />
    </v-btn>
  </v-app-bar>

  <v-main class="flake-main">
    <!-- Loading -->
    <v-overlay v-if="loading && !bundle" persistent contained class="d-flex align-center justify-center">
      <v-progress-circular indeterminate />
    </v-overlay>

    <!-- Not configured: inline settings form -->
    <v-container v-if="errorKind === 'not_configured'" class="flake-empty">
      <v-card max-width="640" class="mx-auto pa-4">
        <v-card-title>Flake history is not configured</v-card-title>
        <v-card-text>
          <p class="mb-3">
            Point at a GitLab project that publishes a
            <a href="https://github.com/BeamNG/GitLabViz/blob/main/docs/flake-history-integration.md" target="_blank" rel="noopener">flake-history bundle</a>
            to its Generic Package Registry. The viewer downloads the newest published version.
          </p>
          <v-text-field
            v-model="form.projectId"
            label="GitLab project ID or path"
            placeholder="123  or  mygroup/myproj"
            density="compact"
            hint="Numeric ID or 'group/project' — same project that publishes the bundle"
            persistent-hint
          />
          <v-text-field
            v-model="form.packageName"
            label="Package name"
            placeholder="flake-history"
            density="compact"
            class="mt-3"
          />
          <v-text-field
            v-model.number="form.refreshMinutes"
            type="number"
            label="Refresh interval (minutes; 0 = manual)"
            min="0"
            density="compact"
            class="mt-3"
          />
          <v-alert
            v-if="!hasGitlabConfigured"
            type="warning" variant="tonal" density="compact" class="mt-4"
          >
            Set the GitLab base URL and token in the main settings panel first — those values are reused here.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" @click="saveForm" :disabled="!hasGitlabConfigured || !form.projectId">Save and load</v-btn>
        </v-card-actions>
      </v-card>
    </v-container>

    <!-- Schema mismatch -->
    <v-alert v-else-if="errorKind === 'unsupported_schema'" type="error" class="ma-4">
      <strong>Unsupported bundle version.</strong>
      This GitLabViz reads up to schema_version {{ supportedSchemaVersion }}; the published bundle is newer. Upgrade GitLabViz to read it.
    </v-alert>

    <!-- No package yet -->
    <v-alert v-else-if="errorKind === 'not_found'" type="info" class="ma-4">
      No bundle has been published under
      <code>{{ flakeSettings.packageName }}</code> in this project yet. Has your bundler pipeline run?
    </v-alert>

    <!-- Generic error -->
    <v-alert v-else-if="errorKind === 'error'" type="error" class="ma-4">
      Failed to load flake history: {{ errorMessage }}
    </v-alert>

    <!-- Loaded: leaderboard + heatmap -->
    <div v-else-if="bundle" class="flake-grid">
      <section class="flake-leaderboard">
        <h3 class="text-subtitle-1 pa-2">Leaderboard <span class="text-caption">(most flaky first)</span></h3>
        <v-data-table
          :headers="leaderboardHeaders"
          :items="leaderboard"
          :items-per-page="50"
          density="compact"
          item-value="test_id"
          v-model:selected="selectedTestIds"
          select-strategy="single"
          show-select
          @click:row="onRowClick"
          class="flake-table"
        >
          <template #item.pass_rate="{ value }">
            {{ value === null ? '—' : (value * 100).toFixed(1) + '%' }}
          </template>
          <template #item.flake_classification="{ value }">
            <v-chip :color="classColor(value)" size="small" variant="tonal">{{ value || '—' }}</v-chip>
          </template>
        </v-data-table>
      </section>

      <section class="flake-heatmap">
        <h3 class="text-subtitle-1 pa-2">Heatmap <span class="text-caption">(rightmost = most recent)</span></h3>
        <div class="flake-heatmap-scroll">
          <table class="flake-heatmap-table">
            <thead>
              <tr>
                <th class="flake-heatmap-test-col">Test</th>
                <th
                  v-for="r in heatmap.runs" :key="r.run_id"
                  class="flake-heatmap-run-col"
                  :title="runTooltip(r)"
                >{{ formatTickLabel(r.started_at) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in heatmap.tests"
                :key="t.test_id"
                :class="{ selected: selectedTestIds.includes(t.test_id) }"
                @click="selectedTestIds = [t.test_id]"
              >
                <td class="flake-heatmap-test-col">
                  <span :title="t.test_id">{{ t.name }}</span>
                </td>
                <td
                  v-for="(cell, i) in heatmap.cells[t.test_id]" :key="i"
                  :class="['flake-cell', `flake-cell--${cell}`,
                           heatmap.interruptedRunIds.has(heatmap.runs[i].run_id) ? 'flake-cell--interrupted' : '']"
                  :title="cellTooltip(t, heatmap.runs[i], cell)"
                  @click.stop="openPipeline(heatmap.runs[i])"
                ></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </v-main>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  fetchLatestBundle, selectFlakeLeaderboard, selectHeatmapMatrix,
  FlakeNotConfiguredError, FlakeBundleNotFoundError, UnsupportedSchemaVersionError,
  SUPPORTED_SCHEMA_VERSION,
} from '../services/flake'
import { decodeGitLabTokenFromStorage } from '../utils/tokenObfuscation'

const props = defineProps({
  settings: { type: Object, required: true },
})
defineEmits(['close'])

const supportedSchemaVersion = SUPPORTED_SCHEMA_VERSION
const flakeSettings = computed(() => props.settings.config.flakeHistory || {})
const hasGitlabConfigured = computed(() => Boolean(props.settings.config.gitlabApiBaseUrl))

const bundle = ref(null)
const loading = ref(false)
const errorKind = ref(null) // 'not_configured' | 'not_found' | 'unsupported_schema' | 'error' | null
const errorMessage = ref('')

const suiteFilter = ref('(all)')
const gfxFilter = ref('(all)')
const lastNRuns = ref(30)
const selectedTestIds = ref([])

const form = ref({
  projectId: flakeSettings.value.projectId || '',
  packageName: flakeSettings.value.packageName || 'flake-history',
  refreshMinutes: flakeSettings.value.refreshMinutes ?? 60,
})

const filterOptions = computed(() => ({
  suites: [...new Set((bundle.value?.runs || []).map(r => r.suite).filter(Boolean))].sort(),
  gfxApis: [...new Set((bundle.value?.runs || []).map(r => r.gfx_api).filter(Boolean))].sort(),
}))

const facet = computed(() => ({
  suite: suiteFilter.value === '(all)' ? null : suiteFilter.value,
  gfxApi: gfxFilter.value === '(all)' ? null : gfxFilter.value,
}))

const leaderboard = computed(() =>
  bundle.value ? selectFlakeLeaderboard(bundle.value, { ...facet.value, limit: 100 }) : []
)
const heatmap = computed(() =>
  bundle.value
    ? selectHeatmapMatrix(bundle.value, { ...facet.value, lastNRuns: lastNRuns.value })
    : { runs: [], tests: [], cells: {}, interruptedRunIds: new Set() }
)

const leaderboardHeaders = [
  { title: 'Test', key: 'name' },
  { title: 'Pass rate', key: 'pass_rate', align: 'end' },
  { title: 'Last', key: 'last_status', align: 'center' },
  { title: 'Class', key: 'flake_classification' },
]

const classColor = (c) => ({
  stable: 'success',
  intermittent: 'warning',
  actively_flaky: 'error',
  broken: 'error',
}[c] || undefined)

const onRowClick = (_e, { item }) => { selectedTestIds.value = [item.test_id] }

const formatTickLabel = (iso) => {
  if (!iso) return ''
  return iso.slice(5, 10) // MM-DD
}
const runTooltip = (r) => `${r.suite || '?'} • ${r.gfx_api || '?'} • ${r.runner_id || '?'} • ${r.started_at || ''} • status=${r.status}`
const cellTooltip = (t, r, cell) => `${t.name}\nrun: ${r.run_id}\n${cell}${r.status === 'interrupted' ? ' (run was interrupted)' : ''}`

const openPipeline = (r) => {
  if (r?.pipeline_url) window.open(r.pipeline_url, '_blank', 'noopener')
}

const isConfigured = () => Boolean(
  props.settings.config.gitlabApiBaseUrl && flakeSettings.value.projectId
)

const reload = async () => {
  if (!isConfigured()) {
    errorKind.value = 'not_configured'
    return
  }
  loading.value = true
  errorKind.value = null
  errorMessage.value = ''
  try {
    const token = decodeGitLabTokenFromStorage(props.settings.config.token)
    bundle.value = await fetchLatestBundle({
      gitlabUrl: props.settings.config.gitlabApiBaseUrl,
      projectIdOrPath: flakeSettings.value.projectId,
      packageName: flakeSettings.value.packageName || 'flake-history',
      token,
    })
  } catch (e) {
    if (e instanceof FlakeNotConfiguredError)        errorKind.value = 'not_configured'
    else if (e instanceof FlakeBundleNotFoundError)  errorKind.value = 'not_found'
    else if (e instanceof UnsupportedSchemaVersionError) errorKind.value = 'unsupported_schema'
    else { errorKind.value = 'error'; errorMessage.value = e?.message || String(e) }
  } finally {
    loading.value = false
  }
}

const saveForm = () => {
  props.settings.config.flakeHistory = {
    projectId: form.value.projectId.trim(),
    packageName: (form.value.packageName || 'flake-history').trim(),
    refreshMinutes: Math.max(0, Number(form.value.refreshMinutes) || 0),
  }
  reload()
}

let refreshTimer = null
const scheduleRefresh = () => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  const mins = Number(flakeSettings.value.refreshMinutes) || 0
  if (mins > 0) refreshTimer = setInterval(reload, mins * 60_000)
}
watch(() => flakeSettings.value.refreshMinutes, scheduleRefresh)

onMounted(() => { reload(); scheduleRefresh() })
onBeforeUnmount(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<style scoped>
.flake-main { padding: 0; }
.flake-grid {
  display: grid;
  grid-template-columns: 30% 70%;
  height: calc(100vh - 64px);
  overflow: hidden;
}
.flake-leaderboard, .flake-heatmap { overflow: hidden; display: flex; flex-direction: column; }
.flake-table { flex: 1; overflow: auto; }
.flake-heatmap-scroll { flex: 1; overflow: auto; }
.flake-heatmap-table { border-collapse: collapse; font-size: 11px; }
.flake-heatmap-table th, .flake-heatmap-table td {
  padding: 2px 4px;
  border-right: 1px solid rgba(127, 127, 127, 0.2);
  white-space: nowrap;
}
.flake-heatmap-test-col {
  min-width: 240px; max-width: 360px;
  overflow: hidden; text-overflow: ellipsis;
  position: sticky; left: 0;
  background: var(--v-theme-surface, #fff);
  z-index: 1;
}
.flake-heatmap-run-col { writing-mode: vertical-rl; transform: rotate(180deg); }
.flake-cell { width: 14px; height: 14px; cursor: pointer; }
.flake-cell--pass    { background: #4caf50; }
.flake-cell--fail    { background: #f44336; }
.flake-cell--not_run { background: #555; opacity: 0.18; }
.flake-cell--interrupted { box-shadow: inset 0 0 0 2px #f44336; background: transparent; }
tr.selected td { background: rgba(33, 150, 243, 0.12); }
.flake-empty { padding-top: 48px; }
</style>
