import { call, fork, select, takeEvery, takeLatest } from "redux-saga/effects";
import Logger from "../../lib/Logger";
import { WebsocketListener } from "./messenger.ws";

// Action creators
import {
  LoadServerList as LoadServerListAction,
  CheckAvatar as CheckAvatarAction,
  SaveSelfAvatar as SaveSelfAvatarAction,
  LoadPortalBulletin as LoadPortalBulletinAction,
  RefreshPortalBulletin as RefreshPortalBulletinAction,
  LoadBulletin as LoadBulletinAction,
  LoadBulletinDetail as LoadBulletinDetailAction,
  RequestServerAddress as RequestServerAddressAction,
  LoadSessionList as LoadSessionListAction,
  LoadCurrentSession as LoadCurrentSessionAction,
  SendContent as SendContentAction,
  ShowForwardBulletin as ShowForwardBulletinAction,
  ForwardBulletin as ForwardBulletinAction,
  ServerAdd as ServerAddAction,
  ServerDel as ServerDelAction,
  ServerSetDefault as ServerSetDefaultAction,
  ServerToggle as ServerToggleAction,
  PublishBulletin as PublishBulletinAction,
  BulletinReply as BulletinReplyAction,
  BulletinMarkToggle as BulletinMarkToggleAction,
  RequestTagBulletin as RequestTagBulletinAction,
  RequestReplyBulletin as RequestReplyBulletinAction,
  LoadBookmarkBulletin as LoadBookmarkBulletinAction,
  CreateGroup as CreateGroupAction,
  DeleteGroup as DeleteGroupAction,
  AcceptGroupRequest as AcceptGroupRequestAction,
  RejectGroupRequest as RejectGroupRequestAction,
  ComposeMemberAdd as ComposeMemberAddAction,
  ComposeMemberDel as ComposeMemberDelAction,
  LoadFollowBulletin as LoadFollowBulletinAction,
  LoadAddressBulletin as LoadAddressBulletinAction,
  RequestRandomBulletin as RequestRandomBulletinAction,
  SendFile as SendFileAction,
  SaveBulletinFile as SaveBulletinFileAction,
  FetchBulletinFile as FetchBulletinFileAction,
  SaveChatFile as SaveChatFileAction,
  FetchChatFile as FetchChatFileAction,
  BulletinFileAdd as BulletinFileAddAction,
  BulletinFileDel as BulletinFileDelAction,
  BulletinTagAdd as BulletinTagAddAction,
  BulletinTagDel as BulletinTagDelAction,
  BulletinQuoteAdd as BulletinQuoteAddAction,
  BulletinQuoteDel as BulletinQuoteDelAction,
  BulletinQuote as BulletinQuoteAction,
  UploadBulletin as UploadBulletinAction,
} from "./messenger.actions";

// Bulletin saga handlers
import {
  CheckAvatar as CheckAvatarHandler,
  SaveSelfAvatar as SaveSelfAvatarHandler,
  LoadPortalBulletin as LoadPortalBulletinHandler,
  RefreshPortalBulletin as RefreshPortalBulletinHandler,
  LoadBulletin as LoadBulletinHandler,
  LoadBulletinDetail as LoadBulletinDetailHandler,
  RequestServerAddress as RequestServerAddressHandler,
  PublishBulletin as PublishBulletinHandler,
  BulletinReply as BulletinReplyHandler,
  BulletinMarkToggle as BulletinMarkToggleHandler,
  RequestTagBulletin as RequestTagBulletinHandler,
  RequestReplyBulletin as RequestReplyBulletinHandler,
  LoadBookmarkBulletin as LoadBookmarkBulletinHandler,
  LoadFollowBulletin as LoadFollowBulletinHandler,
  LoadAddressBulletin as LoadAddressBulletinHandler,
  RequestRandomBulletin as RequestRandomBulletinHandler,
  BulletinFileAdd as BulletinFileAddHandler,
  BulletinFileDel as BulletinFileDelHandler,
  BulletinTagAdd as BulletinTagAddHandler,
  BulletinTagDel as BulletinTagDelHandler,
  BulletinQuoteAdd as BulletinQuoteAddHandler,
  BulletinQuoteDel as BulletinQuoteDelHandler,
  BulletinQuote as BulletinQuoteHandler,
  UploadBulletin as UploadBulletinHandler,
} from "./messenger.bulletin";

// File transfer saga handlers
import {
  SendFile as SendFileHandler,
  SaveBulletinFile as SaveBulletinFileHandler,
  FetchBulletinFile as FetchBulletinFileHandler,
  SaveChatFile as SaveChatFileHandler,
  FetchChatFile as FetchChatFileHandler,
} from "./messenger.file";

// Session + chat saga handlers
import { LoadSessionList as LoadSessionListHandler } from "./messenger.session";

import {
  LoadCurrentSession as LoadCurrentSessionHandler,
  LoadServerList as LoadServerListSaga,
  ServerAdd,
  ServerDel,
  ServerSetDefault,
  ServerToggle,
} from "./MessengerSaga";

import {
  SendPrivateContent,
  ShowForwardBulletin as ShowForwardBulletinHandler,
  ForwardBulletin as ForwardBulletinHandler,
} from "./messenger.private";

import {
  SendGroupContent,
  ComposeMemberAdd as ComposeMemberAddHandler,
  ComposeMemberDel as ComposeMemberDelHandler,
} from "./messenger.group";

// Group management sagas
import {
  CreateGroup as CreateGroupHandler,
  DeleteGroup as DeleteGroupHandler,
  AcceptGroupRequest as AcceptGroupRequestHandler,
  RejectGroupRequest as RejectGroupRequestHandler,
} from "./MessengerSaga";

import { SessionType } from "../../lib/AppConst";

/**
 * Dispatch SendContent to the correct handler based on session type.
 */
function* sendContentDispatcher(action) {
  try {
    const currentSession = yield select(
      (state) => state.Messenger.CurrentSession,
    );
    if (!currentSession) return;
    if (currentSession.type === SessionType.Group) {
      yield call(SendGroupContent, action);
    } else if (currentSession.type === SessionType.Private) {
      yield call(SendPrivateContent, action);
    } else {
      Logger.warn(
        "[sendContentDispatcher] unknown session type:",
        currentSession.type,
      );
    }
  } catch (e) {
    Logger.error("[sendContentDispatcher] failed:", e.message);
  }
}

export function* watchMessenger() {
  yield fork(WebsocketListener);

  // Bulletin loading
  yield takeEvery(LoadPortalBulletinAction.type, LoadPortalBulletinHandler);
  yield takeEvery(
    RefreshPortalBulletinAction.type,
    RefreshPortalBulletinHandler,
  );
  yield takeEvery(LoadBulletinAction.type, LoadBulletinHandler);
  yield takeEvery(LoadBulletinDetailAction.type, LoadBulletinDetailHandler);
  yield takeEvery(RequestServerAddressAction.type, RequestServerAddressHandler);

  // Session management
  yield takeEvery(LoadSessionListAction.type, LoadSessionListHandler);
  yield takeEvery(LoadCurrentSessionAction.type, LoadCurrentSessionHandler);

  // Chat send
  yield takeEvery(SendContentAction.type, sendContentDispatcher);

  // Server management — load list from DB on screen focus
  yield takeLatest(LoadServerListAction.type, LoadServerListSaga);
  yield takeEvery(ServerAddAction.type, ServerAdd);
  yield takeEvery(ServerDelAction.type, ServerDel);
  yield takeEvery(ServerSetDefaultAction.type, ServerSetDefault);
  yield takeEvery(ServerToggleAction.type, ServerToggle);

  // Bulletin publish — takeLatest: only the most recent publish attempt is processed
  yield takeLatest(PublishBulletinAction.type, PublishBulletinHandler);

  // Reply — takeLatest: only the most recent reply attempt matters
  yield takeLatest(BulletinReplyAction.type, BulletinReplyHandler);

  // Bookmark toggle — every toggle is meaningful (no dedup needed)
  yield takeEvery(BulletinMarkToggleAction.type, BulletinMarkToggleHandler);

  // Bulletin publish tag/quote management
  yield takeEvery(BulletinTagAddAction.type, BulletinTagAddHandler);
  yield takeEvery(BulletinTagDelAction.type, BulletinTagDelHandler);
  yield takeEvery(BulletinQuoteAddAction.type, BulletinQuoteAddHandler);
  yield takeEvery(BulletinQuoteDelAction.type, BulletinQuoteDelHandler);
  // Quote from detail view — takeLatest: only the most recent quote matters
  yield takeLatest(BulletinQuoteAction.type, BulletinQuoteHandler);

  // Tag bulletin — every request is independent
  yield takeEvery(RequestTagBulletinAction.type, RequestTagBulletinHandler);

  // Reply bulletin list — every request loads a page of replies; independent per hash
  yield takeEvery(RequestReplyBulletinAction.type, RequestReplyBulletinHandler);

  // Load bookmark bulletins from local DB
  yield takeEvery(LoadBookmarkBulletinAction.type, LoadBookmarkBulletinHandler);

  // Group management
  yield takeLatest(CreateGroupAction.type, CreateGroupHandler);
  yield takeLatest(DeleteGroupAction.type, DeleteGroupHandler);
  yield takeLatest(AcceptGroupRequestAction.type, AcceptGroupRequestHandler);
  yield takeLatest(RejectGroupRequestAction.type, RejectGroupRequestHandler);

  // Compose member selection (toggled frequently — takeLatest to avoid races)
  yield takeLatest(ComposeMemberAddAction.type, ComposeMemberAddHandler);
  yield takeLatest(ComposeMemberDelAction.type, ComposeMemberDelHandler);

  // Load followed bulletins from local DB
  yield takeEvery(LoadFollowBulletinAction.type, LoadFollowBulletinHandler);

  // Load address bulletins from local DB
  yield takeEvery(LoadAddressBulletinAction.type, LoadAddressBulletinHandler);

  // Request random bulletins from server
  yield takeEvery(
    RequestRandomBulletinAction.type,
    RequestRandomBulletinHandler,
  );

  // Bulletin forward — show forward modal then execute actual forward
  yield takeEvery(ShowForwardBulletinAction.type, ShowForwardBulletinHandler);
  yield takeLatest(ForwardBulletinAction.type, ForwardBulletinHandler);

  // File transfer
  yield takeLatest(SendFileAction.type, SendFileHandler);
  yield takeLatest(BulletinFileAddAction.type, BulletinFileAddHandler);
  yield takeEvery(BulletinFileDelAction.type, BulletinFileDelHandler);

  // Bulletin file download — triggered from bulletin detail UI
  yield takeLatest(SaveBulletinFileAction.type, SaveBulletinFileHandler);
  yield takeEvery(FetchBulletinFileAction.type, FetchBulletinFileHandler);

  // Chat file download & save — triggered from chat detail UI
  yield takeLatest(SaveChatFileAction.type, SaveChatFileHandler);
  yield takeLatest(FetchChatFileAction.type, FetchChatFileHandler);

  // Upload bulletin — cache a bulletin from external source
  yield takeEvery(UploadBulletinAction.type, UploadBulletinHandler);

  // Avatar — ensure metadata exists in DB (CheckAvatar) or save uploaded avatar (SaveSelfAvatar)
  yield takeEvery(CheckAvatarAction.type, CheckAvatarHandler);
  yield takeLatest(SaveSelfAvatarAction.type, SaveSelfAvatarHandler);
}
