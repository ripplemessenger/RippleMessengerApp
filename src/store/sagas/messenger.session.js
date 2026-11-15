import { all, call, put, select } from "redux-saga/effects";
import Logger from "../../lib/Logger";
import { SessionType } from "../../lib/AppConst";
import { setSessionList } from "../slices/MessengerSlice";
import { dbAPI } from "../../db";

export function* LoadSessionList() {
  try {
    const address = yield select((state) => state.User.Address);
    if (!address) {
      return;
    }
    let session_list = [];

    // Private sessions: one aggregate query for unread + timestamp, then per-peer last_message
    const friend_list = yield call(() => dbAPI.getMyFriends(address));
    if (friend_list.length > 0) {
      const summaries = yield call(() => dbAPI.getPrivateSessionSummaries(address));
      const lastMsgResults = yield all(
        friend_list.map((friend) =>
          call(() => dbAPI.getLastPrivateMessageBothDir(address, friend.remote)),
        ),
      );
      for (let i = 0; i < friend_list.length; i++) {
        const peer = friend_list[i].remote;
        const summary = summaries[peer];
        session_list.push({
          type: SessionType.Private,
          address: peer,
          new_msg_count: summary ? summary.unread : 0,
          updated_at: summary ? summary.last_signed_at : 0,
          last_message: lastMsgResults[i],
        });
      }
    }

    // Group sessions: one aggregate query for unread + timestamp, then per-group last_message
    const group_list = yield select((state) => state.Messenger.GroupList);
    if (group_list.length > 0) {
      const joined_groups = [];
      for (let i = 0; i < group_list.length; i++) {
        const group = group_list[i];
        if (group.cleared_at !== null && group.cleared_at !== undefined) continue;
        let member = [...group.member];
        member.push(group.created_by);
        member = [...new Set(member)];
        if (!member.includes(address)) continue;
        joined_groups.push({ ...group, member });
      }

      if (joined_groups.length > 0) {
        const summaries = yield call(() =>
          dbAPI.getGroupSessionSummaries(joined_groups.map((g) => g.hash)),
        );
        const lastMsgResults = yield all(
          joined_groups.map((g) => call(() => dbAPI.getLastGroupMessage(g.hash))),
        );
        for (let i = 0; i < joined_groups.length; i++) {
          const group = joined_groups[i];
          const summary = summaries[group.hash];
          session_list.push({
            type: SessionType.Group,
            hash: group.hash,
            name: group.name,
            member: group.member,
            new_msg_count: summary ? summary.unread : 0,
            updated_at: summary ? summary.last_signed_at : 0,
            last_message: lastMsgResults[i],
            delete_json: group.delete_json || null,
          });
        }
      }
    }

    session_list = [...session_list].sort(
      (a, b) => b.updated_at - a.updated_at,
    );
    yield put(setSessionList(session_list));
  } catch (e) {
    Logger.error("[LoadSessionList] failed:", e.message);
  }
}

/**
 * Bump a single session entry in the Redux store — zero DB queries.
 *
 * Called after a new private/group message is stored, instead of re-running
 * the full LoadSessionList (O(n) queries). We just increment the unread count
 * and update the timestamp for the one affected session, then re-sort.
 */
export function* BumpSession({ sessionType, key, timestamp, unread = true }) {
  try {
    const session_list = yield select((state) => state.Messenger.SessionList);
    if (!session_list || session_list.length === 0) {
      yield call(LoadSessionList);
      return;
    }

    const updated = session_list.map((s) => {
      const isMatch =
        (sessionType === SessionType.Private && s.type === SessionType.Private && s.address === key) ||
        (sessionType === SessionType.Group && s.type === SessionType.Group && s.hash === key);
      if (!isMatch) return s;
      return {
        ...s,
        new_msg_count: unread ? s.new_msg_count + 1 : s.new_msg_count,
        updated_at: timestamp,
      };
    });

    updated.sort((a, b) => b.updated_at - a.updated_at);
    yield put(setSessionList(updated));
  } catch (e) {
    Logger.error("[BumpSession] failed:", e.message);
  }
}
