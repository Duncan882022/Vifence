import type { InspectionProject, InspectionAsset } from '../types'

export const INSPECTION_PROJECT: InspectionProject = {
  id: 'sgc-dsct',
  name: 'SGC-DSCT',
  code: 'SGC-DSCT',
  bimModel: 'DUL.ifc + SUON.ifc (gộp 1 mô hình)',
  ifcVersion: 'IFC4X3 / IFC2X3',
  afcRevision: null,
  planVersion: 'IP-2026.09-v3',
  planStatus: 'REVIEW',
}

export const DAM_HOP_ASSET_ID = 'dam-hop'

export const INSPECTION_ASSETS: InspectionAsset[] = [
  {
    id: DAM_HOP_ASSET_ID,
    code: 'DH-32.6',
    name: 'Dầm hộp DƯL 32.6m',
    type: 'Dầm hộp BTCT DƯL căng sau',
    location: 'SGC-DSCT · Dầm hộp điển hình',
    ifcFile: 'DUL.ifc + SUON.ifc',
    completenessPct: 68,
    stages: { gd1: 'confirmed', gd2: 'review', gd3: 'waiting' },
  },
]
