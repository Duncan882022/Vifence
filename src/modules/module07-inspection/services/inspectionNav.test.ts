import { describe, expect, it } from 'vitest'
import { INSPECTION_PROJECT } from '../data/inspectionProject'
import {
  CLASSIFICATION_STEPS,
  INSPECTION_PACKAGES,
  classificationStepIndex,
  findPackage,
  inspectionPackageListPath,
  inspectionWorkspacePath,
  legacyInspectionRedirect,
} from './inspectionNav'

describe('inspection classification', () => {
  it('project SGC-DSCT → dầm hộp → detail', () => {
    expect(INSPECTION_PROJECT.code).toBe('SGC-DSCT')
    expect(CLASSIFICATION_STEPS).toEqual(['project', 'package', 'detail'])
    expect(classificationStepIndex({})).toBe('project')
    expect(classificationStepIndex({ projectId: 'sgc-dsct' })).toBe('package')
    expect(classificationStepIndex({ projectId: 'sgc-dsct', packageId: 'dam-hop' })).toBe('detail')
  })

  it('DUL + SUON are one merged package', () => {
    expect(INSPECTION_PACKAGES).toHaveLength(1)
    expect(findPackage('dam-hop')?.sources).toEqual(['suon', 'dul'])
    expect(findPackage('dam-hop')?.file).toBe('DUL.ifc + SUON.ifc')
    expect(findPackage('dul')).toBeUndefined()
    expect(findPackage('suon')).toBeUndefined()
  })

  it('redirects old DUL / SUON / nhịp URLs to the merged girder', () => {
    for (const old of ['dul', 'suon', 'dul-01', 'dul-03', 'suon-01']) {
      expect(legacyInspectionRedirect(old)).toBe('/inspection/sgc-dsct/dam-hop')
    }
    expect(legacyInspectionRedirect('sgc-dsct')).toBeNull()
    expect(legacyInspectionRedirect('dam-hop')).toBeNull()
  })

  it('builds workspace paths under the selected project', () => {
    expect(inspectionPackageListPath('sgc-dsct')).toBe('/inspection/sgc-dsct')
    expect(inspectionWorkspacePath('sgc-dsct')).toBe('/inspection/sgc-dsct/dam-hop')
  })
})
