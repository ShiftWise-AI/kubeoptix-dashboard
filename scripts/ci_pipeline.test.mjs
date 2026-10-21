import { describe, expect, it } from 'vitest'
import {
  allowedPR,
  nextVersion,
  replaceDashboardImage,
  replacePackageLockVersion,
  replacePackageVersion,
} from './ci_pipeline.mjs'

describe('release pipeline helpers', () => {
  it('allows only same-repository branches in the approved PR flow', () => {
    const makePR = (base, head, fork = false) => ({
      base: { ref: base, repo: { full_name: 'ShiftWise-AI/kubeoptix-dashboard', id: 1 } },
      head: { ref: head, repo: { full_name: fork ? 'someone/fork' : 'ShiftWise-AI/kubeoptix-dashboard', id: fork ? 2 : 1 } },
    })

    expect(allowedPR(makePR('develop', 'feature/ui'))).toBe(true)
    expect(allowedPR(makePR('develop', 'fix/security'))).toBe(true)
    expect(allowedPR(makePR('main', 'develop'))).toBe(true)
    expect(allowedPR(makePR('main', 'fix/release'))).toBe(true)
    expect(allowedPR(makePR('main', 'feature/ui'))).toBe(false)
    expect(allowedPR(makePR('develop', 'feature/ui', true))).toBe(false)
  })

  it('selects the next patch using all published releases', () => {
    expect(nextVersion('1.0.0', ['1.0.2', '1.0.5'])).toBe('1.0.6')
    expect(nextVersion('1.4.7', [])).toBe('1.4.8')
    expect(() => nextVersion('1.2.9', ['1.10.0'])).toThrow()
    expect(() => nextVersion('1.0.0', ['2.0.0'])).toThrow()
  })

  it('updates only the root package version', () => {
    const source = '{\n  "name": "webui",\n  "version": "1.0.0",\n  "private": true\n}\n'
    expect(replacePackageVersion(source, '1.0.1')).toBe(source.replace('"1.0.0"', '"1.0.1"'))
  })

  it('keeps package-lock root versions in sync without changing dependency versions', () => {
    const source = JSON.stringify({
      name: 'webui',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'webui', version: '1.0.0' },
        'node_modules/example': { version: '1.0.0' },
      },
    }, null, 2) + '\n'
    const updated = JSON.parse(replacePackageLockVersion(source, '1.0.0', '1.0.1'))
    expect(updated.version).toBe('1.0.1')
    expect(updated.packages[''].version).toBe('1.0.1')
    expect(updated.packages['node_modules/example'].version).toBe('1.0.0')
    expect(() => replacePackageLockVersion(source, '1.0.2', '1.0.3')).toThrow()
  })

  it('pins only DashboardImage and safely supports reruns', () => {
    const source = 'CoreAIImage: registryImage(constants.CoreAIName),\n' +
      'DashboardImage: registryImage(constants.DashboardName),\n'
    const reference = 'quay.io/parraes/kubeoptix-dashboard:1.0.1@sha256:' + 'a'.repeat(64)
    const updated = replaceDashboardImage(source, reference)
    expect(updated).toContain(`DashboardImage: "${reference}",`)
    expect(updated).toContain('CoreAIImage: registryImage(constants.CoreAIName),')
    expect(replaceDashboardImage(updated, reference)).toBe(updated)
    expect(() => replaceDashboardImage('unexpected contract', reference)).toThrow()
  })
})