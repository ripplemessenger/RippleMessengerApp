import RNFS from 'react-native-fs'
import { call, fork, put } from 'redux-saga/effects'

import { getDB } from '../../db'
import Logger from '../../lib/Logger'
import { setAppBaseDir } from '../slices/CommonSlice'

function* GetDB() {
  try {
    yield call(LoadAppBaseDir)
    yield call(getDB)
  } catch (e: any) {
    Logger.error('[GetDB] failed:', e.message || String(e))
  }
}

function* LoadAppBaseDir() {
  const app_base_path = RNFS.DocumentDirectoryPath + '/ripplemessenger/'
  yield put(setAppBaseDir(app_base_path))
}

export function* watchCommon() {
  yield fork(GetDB)
}
