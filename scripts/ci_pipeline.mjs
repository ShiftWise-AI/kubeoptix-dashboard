import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REPOSITORY = 'ShiftWise-AI/kubeoptix-dashboard'
export const OPERATOR = 'ShiftWise-AI/kubeoptix-operator'
export const IMAGE = 'quay.io/parraes/kubeoptix-dashboard'
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

function run(args, cwd = process.cwd(), input) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8', input }).trim()
}

function api(path, method = 'GET', payload) {
  const args = ['gh', 'api', path, '--method', method]
  if (payload !== undefined) args.push('--input', '-')
  const result = execFileSync(args[0], args.slice(1), {
    encoding: 'utf8',
    input: payload === undefined ? undefined : JSON.stringify(payload),
  })
  return JSON.parse(result)
}

export function allowedPR(pr, repository = REPOSITORY) {
  const base = pr.base ?? {}
  const head = pr.head ?? {}
  const baseRepository = base.repo ?? {}
  const headRepository = head.repo ?? {}
  const local = baseRepository.full_name === repository &&
    headRepository.id !== undefined && headRepository.id === baseRepository.id
  if (!local) return false
  if (base.ref === 'develop') return /^(feature|fix)\/\S+$/.test(head.ref ?? '')
  if (base.ref === 'main') return head.ref === 'develop' || /^fix\/\S+$/.test(head.ref ?? '')
  return false
}

export function versionTuple(value) {
  if (!SEMVER.test(value)) throw new Error(`Invalid MAJOR.MINOR.PATCH: ${value}`)
  return value.split('.').map(Number)
}

export function nextVersion(current, released) {
  const baseline = versionTuple(current)
  const versions = released.map(versionTuple)
  if (versions.some((version) => version[0] > baseline[0] ||
    (version[0] === baseline[0] && version[1] > baseline[1]))) {
    throw new Error('Source major/minor is older than an existing release')
  }
  const patch = Math.max(baseline[2], ...versions
    .filter((version) => version[0] === baseline[0] && version[1] === baseline[1])
    .map((version) => version[2]))
  return `${baseline[0]}.${baseline[1]}.${patch + 1}`
}

export function replacePackageVersion(text, version) {
  const document = JSON.parse(text)
  const oldVersion = document.version
  versionTuple(oldVersion)
  versionTuple(version)
  const lines = text.split('\n')
  const assignments = lines.map((line, index) => ({
    index,
    match: line.match(/^([\t ]*"version"[\t ]*:[\t ]*)"([^"]+)"([\t ]*,?)[\t ]*$/),
  })).filter(({ match }) => match?.[2] === oldVersion)
  if (assignments.length !== 1) throw new Error('Expected exactly one root package version assignment')
  const { index } = assignments[0]
  lines[index] = lines[index].replace(`"${oldVersion}"`, `"${version}"`)
  const updated = lines.join('\n')
  if (JSON.parse(updated).version !== version) throw new Error('Package version update did not validate')
  return updated
}

export function replacePackageLockVersion(text, oldVersion, version) {
  const lock = JSON.parse(text)
  versionTuple(oldVersion)
  versionTuple(version)
  if (lock.version !== oldVersion || lock.packages?.['']?.version !== oldVersion) {
    throw new Error('Package lock version does not match package.json')
  }
  lock.version = version
  lock.packages[''].version = version
  return `${JSON.stringify(lock, null, 2)}\n`
}

export function replaceDashboardImage(text, reference) {
  const pattern = /^([\t ]*DashboardImage:[\t ]*)(?:registryImage\(constants\.DashboardName\)|"[^"\n]+"),[\t ]*$/gm
  const matches = [...text.matchAll(pattern)]
  if (matches.length !== 1) throw new Error('Operator DashboardImage contract changed; refusing broad edits')
  return text.replace(pattern, `$1"${reference}",`)
}

function verifySource(source) {
  if (!/^[0-9a-f]{40}$/.test(source)) throw new Error('Expected full source commit SHA')
  run(['git', 'merge-base', '--is-ancestor', source, 'origin/main'])
  const prs = api(`repos/${REPOSITORY}/commits/${source}/pulls?per_page=100`)
  const valid = prs.some((pr) => pr.merged_at && pr.merge_commit_sha === source &&
    pr.base?.ref === 'main' && allowedPR(pr))
  if (!valid) throw new Error('Release source must be the merge commit of an allowed same-repository PR to main')
}

function output(values) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required')
  for (const [key, value] of Object.entries(values)) {
    writeFileSync(outputPath, `${key}=${value}\n`, { flag: 'a' })
  }
}

function reserve(source) {
  verifySource(source)
  const tags = run(['git', 'tag', '--list', 'v*']).split('\n').filter(Boolean)
  const releases = tags.map((tag) => tag.slice(1)).filter((tag) => SEMVER.test(tag))
  const marker = `Release-Source: ${source}`
  const matches = tags.filter((tag) => SEMVER.test(tag.slice(1)) &&
    run(['git', 'for-each-ref', '--format=%(contents)', `refs/tags/${tag}`]).split('\n').includes(marker))
  if (matches.length > 1) throw new Error('Multiple releases reserved for the same source')

  let tag
  if (matches.length === 1) {
    tag = matches[0]
    const document = JSON.parse(run(['git', 'show', `${tag}:package.json`]))
    if (document.version !== tag.slice(1)) throw new Error('Reserved release version does not match package.json')
    const lock = JSON.parse(run(['git', 'show', `${tag}:package-lock.json`]))
    if (lock.version !== tag.slice(1) || lock.packages?.['']?.version !== tag.slice(1)) {
      throw new Error('Reserved release version does not match package-lock.json')
    }
    if (run(['git', 'rev-parse', `${tag}^1`]) !== source) throw new Error('Reserved release has an unexpected source parent')
  } else {
    run(['git', 'checkout', '--detach', source])
    const packagePath = 'package.json'
    const text = readFileSync(packagePath, 'utf8')
    const oldVersion = JSON.parse(text).version
    const version = nextVersion(oldVersion, releases)
    writeFileSync(packagePath, replacePackageVersion(text, version))
    const lockPath = 'package-lock.json'
    const lockText = readFileSync(lockPath, 'utf8')
    writeFileSync(lockPath, replacePackageLockVersion(lockText, oldVersion, version))
    run(['git', 'add', packagePath, lockPath])
    run(['git', 'commit', '-m', `Release ${version}\n\n${marker}`])
    tag = `v${version}`
    run(['git', 'tag', '-a', tag, '-m', marker])
    run(['git', 'push', 'origin', `refs/tags/${tag}`])
  }
  run(['git', 'checkout', '--detach', tag])
  output({ version: tag.slice(1), tag, source, commit: run(['git', 'rev-parse', 'HEAD']) })
}

function updateOperator(version, digest, directory) {
  versionTuple(version)
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid registry digest')
  const reference = `${IMAGE}:${version}@${digest}`
  const root = resolve(directory)
  const branch = `fix/dashboard-${version}`
  const remoteBranches = run(['git', 'ls-remote', '--heads', 'origin', branch], root)
  if (remoteBranches) {
    run(['git', 'fetch', 'origin', branch], root)
    run(['git', 'checkout', '--detach', 'FETCH_HEAD'], root)
  }

  const settingsPath = resolve(root, 'internal/operands/settings.go')
  const before = readFileSync(settingsPath, 'utf8')
  const after = replaceDashboardImage(before, reference)
  if (after !== before) {
    writeFileSync(settingsPath, after)
    run(['gofmt', '-w', settingsPath])
  }

  const probe = resolve(root, 'internal/operands/ci_dashboard_release_test.go')
  if (existsSync(probe)) throw new Error('Refusing to overwrite an existing Operator test')
  writeFileSync(probe, 'package operands\nimport "testing"\nfunc TestCIDashboardRelease(t *testing.T) {\n' +
    `if got := FromCR(newShiftWise()).DashboardImage; got != "${reference}" {\n` +
    't.Fatalf("unexpected Dashboard image: %s", got)\n}\n}\n')
  try {
    run(['go', 'test', './internal/operands'], root)
  } finally {
    unlinkSync(probe)
  }

  const changed = run(['git', 'diff', '--name-only'], root).split('\n').filter(Boolean)
  if (changed.length && (changed.length !== 1 || changed[0] !== 'internal/operands/settings.go')) {
    throw new Error('Unexpected Operator changes')
  }
  if (changed.length) {
    run(['git', 'checkout', '-B', branch], root)
    run(['git', 'add', 'internal/operands/settings.go'], root)
    run(['git', 'commit', '-m', `fix: pin Dashboard to ${version}`], root)
    run(['git', 'push', 'origin', `HEAD:refs/heads/${branch}`], root)
  } else if (!remoteBranches) {
    return
  }

  const existing = api(`repos/${OPERATOR}/pulls?state=open&head=ShiftWise-AI:${branch}&base=main`)
  if (existing.length === 0) {
    api(`repos/${OPERATOR}/pulls`, 'POST', {
      title: `fix: update Dashboard to ${version}`,
      head: branch,
      base: 'main',
      body: `Published and verified image: \`${reference}\`.\n\nOnly the Dashboard default changes; Operator and other component versions remain unchanged.`,
    })
  }
}

function option(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

function main() {
  const command = process.argv[2]
  if (command === 'reserve') return reserve(option('--source'))
  if (command === 'operator') {
    return updateOperator(option('--version'), option('--digest'), process.env.OPERATOR_DIRECTORY ?? 'operator')
  }
  throw new Error('Expected command: reserve or operator')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main()