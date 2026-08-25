import { call, fork } from "redux-saga/effects";

import { getDB } from "../../db";
import Logger from "../../lib/Logger";

function* GetDB() {
  try {
    yield call(getDB);
  } catch (e: any) {
    Logger.error("[GetDB] failed:", e.message || String(e));
  }
}

export function* watchCommon() {
  yield fork(GetDB);
}
