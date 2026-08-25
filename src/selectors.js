import { createSelector } from "@reduxjs/toolkit";

// Root slice accessors
export const selectUserAddress = (state) => state.User.Address;

// ── Leaf-level field accessors (Messenger slice) ──
// Each selector only invalidates when its own field changes.
const selectConnsStatus = (state) => state.Messenger.ConnsStatus;
const selectPortalBulletinList = (state) => state.Messenger.PortalBulletinList;
const selectPortalBulletinPage = (state) => state.Messenger.PortalBulletinPage;
const selectPortalBulletinTotalPage = (state) =>
  state.Messenger.PortalBulletinTotalPage;
const selectFollowBulletinList = (state) => state.Messenger.FollowBulletinList;
const selectFollowBulletinPage = (state) => state.Messenger.FollowBulletinPage;
const selectFollowBulletinTotalPage = (state) =>
  state.Messenger.FollowBulletinTotalPage;
const selectBookmarkBulletinList = (state) =>
  state.Messenger.BookmarkBulletinList;
const selectBookmarkBulletinPage = (state) =>
  state.Messenger.BookmarkBulletinPage;
const selectBookmarkBulletinTotalPage = (state) =>
  state.Messenger.BookmarkBulletinTotalPage;
const selectTagBulletinList = (state) => state.Messenger.TagBulletinList;
const selectTagBulletinPage = (state) => state.Messenger.TagBulletinPage;
const selectTagBulletinTotalPage = (state) =>
  state.Messenger.TagBulletinTotalPage;
// Exported for SearchTagItem; used internally by selectTagBulletins
export const selectSearchTagList = (state) => state.Messenger.SearchTagList;
const selectAddressBulletinList = (state) =>
  state.Messenger.AddressBulletinList;
const selectAddressBulletinPage = (state) =>
  state.Messenger.AddressBulletinPage;
const selectAddressBulletinTotalPage = (state) =>
  state.Messenger.AddressBulletinTotalPage;
const selectBulletinAddress = (state) => state.Messenger.BulletinAddress;

// Display bulletin + reply data
const selectDisplayBulletin = (state) => state.Messenger.DisplayBulletin;
const selectDisplayBulletinReplyList = (state) =>
  state.Messenger.DisplayBulletinReplyList;
const selectDisplayBulletinReplyPage = (state) =>
  state.Messenger.DisplayBulletinReplyPage;
const selectDisplayBulletinReplyTotalPage = (state) =>
  state.Messenger.DisplayBulletinReplyTotalPage;

// Group tab fields
const selectGroupRequestList = (state) => state.Messenger.GroupRequestList;
const selectComposeMemberList = (state) => state.Messenger.ComposeMemberList;
const selectGroupList = (state) => state.Messenger.GroupList;

// Server list + connections — TabMessengerNetwork
const selectServerList = (state) => state.Messenger.ServerList;

// ── Leaf-level field accessors (User slice) ──
const selectUserIsAuth = (state) => state.User.IsAuth;
const selectUserNickname = (state) => state.User.Nickname;
const selectUserSeed = (state) => state.User.Seed;
const selectUserAccountList = (state) => state.User.AccountList;
export const selectContactList = (state) => state.User.ContactList;
const selectContactMap = (state) => state.User.ContactMap;

// Export ContactMap for Chat screens (nickname/address resolution)
export { selectContactMap };

// ── Leaf-level field accessors (Common slice) ──
// FlashNotice is read directly by components/FlashNotice.jsx (state.Common.FlashNoticeMessage).

// Connection status — used by Header, ConnectionStatusBanner
export const selectMessengerConnStatus = (state) =>
  state.Messenger.MessengerConnStatus;

// Connected server count derived from ConnsStatus — used by TabMessengerNetwork
export const selectConnectedServerCount = createSelector(
  [selectConnsStatus],
  (conns) => {
    if (!conns) return 0;
    return Object.values(conns).filter((status) => status === WebSocket.OPEN)
      .length;
  },
);

// Portal bulletin list with pagination — most visited page
export const selectPortalBulletins = createSelector(
  [
    selectPortalBulletinList,
    selectPortalBulletinPage,
    selectPortalBulletinTotalPage,
  ],
  (list, page, totalPage) => ({
    list: list || [],
    page: page || 1,
    totalPage: totalPage || 1,
  }),
);

// Follow bulletin list with pagination
export const selectFollowBulletins = createSelector(
  [
    selectFollowBulletinList,
    selectFollowBulletinPage,
    selectFollowBulletinTotalPage,
  ],
  (list, page, totalPage) => ({
    list: list || [],
    page: page || 1,
    totalPage: totalPage || 1,
  }),
);

// Bookmark bulletin list with pagination
export const selectBookmarkBulletins = createSelector(
  [
    selectBookmarkBulletinList,
    selectBookmarkBulletinPage,
    selectBookmarkBulletinTotalPage,
  ],
  (list, page, totalPage) => ({
    list: list || [],
    page: page || 1,
    totalPage: totalPage || 1,
  }),
);

// Tag bulletin list with pagination and search tags
export const selectTagBulletins = createSelector(
  [
    selectTagBulletinList,
    selectTagBulletinPage,
    selectTagBulletinTotalPage,
    selectSearchTagList,
  ],
  (list, page, totalPage, searchTags) => ({
    list: list || [],
    page: page || 1,
    totalPage: totalPage || 1,
    searchTags: searchTags || [],
  }),
);

// Address bulletin list with pagination
export const selectAddressBulletins = createSelector(
  [
    selectAddressBulletinList,
    selectAddressBulletinPage,
    selectAddressBulletinTotalPage,
    selectBulletinAddress,
  ],
  (list, page, totalPage, address) => ({
    list: list || [],
    page: page || 1,
    totalPage: totalPage || 1,
    address,
  }),
);

// Random bulletin list
export const selectRandomBulletins = (state) =>
  state.Messenger.RandomBulletinList || [];

// Chat session data — simple field accessors
export const selectChatSessions = (state) => state.Messenger.SessionList || [];
export const selectCurrentSession = (state) => state.Messenger.CurrentSession;
export const selectCurrentSessionMessages = (state) =>
  state.Messenger.CurrentSessionMessageList || [];
export const selectGroupMembers = (state) =>
  state.Messenger.GroupMemberMap || {};

// ─── Combined memoized selectors for page components ───

// BulletinViewPage — display bulletin + replies with pagination
export const selectDisplayBulletins = createSelector(
  [
    selectDisplayBulletin,
    selectDisplayBulletinReplyList,
    selectDisplayBulletinReplyPage,
    selectDisplayBulletinReplyTotalPage,
  ],
  (bulletin, replyList, replyPage, replyTotalPage) => ({
    DisplayBulletin: bulletin,
    DisplayBulletinReplyList: replyList || [],
    DisplayBulletinReplyPage: replyPage || 1,
    DisplayBulletinReplyTotalPage: replyTotalPage || 0,
  }),
);

// TabGroup — group requests + compose members + group list
export const selectGroupData = createSelector(
  [selectGroupRequestList, selectComposeMemberList, selectGroupList],
  (requests, composeMembers, groups) => ({
    GroupRequestList: requests || [],
    ComposeMemberList: composeMembers || [],
    GroupList: groups || [],
  }),
);

// TabGroup — user profile fields needed by group tab (Address + ContactList)
export const selectUserTabGroup = createSelector(
  [selectUserAddress, selectContactList],
  (address, contacts) => ({
    Address: address,
    ContactList: contacts || [],
  }),
);

// TabMe — user profile fields (Address + Nickname + Seed + AccountList)
export const selectUserTabMe = createSelector(
  [
    selectUserAddress,
    selectUserNickname,
    selectUserSeed,
    selectUserAccountList,
  ],
  (address, nickname, seed, accounts) => ({
    Address: address,
    Nickname: nickname,
    Seed: seed,
    AccountList: accounts || [],
  }),
);

// TabMessengerNetwork — server list + connection statuses
export const selectServerNetworkData = createSelector(
  [selectServerList, selectConnsStatus],
  (servers, conns) => ({
    ServerList: servers || [],
    ConnsStatus: conns || {},
  }),
);

// AuthProvider — IsAuth only
export const selectIsAuth = (state) => state.User.IsAuth;

// BulletinForward — SessionList
// (selectChatSessions already exists and returns SessionList)

// OpenPage — IsAuth + AccountList + Seed
export const selectOpenPageData = createSelector(
  [selectUserIsAuth, selectUserAccountList, selectUserSeed],
  (isAuth, accounts, seed) => ({
    IsAuth: isAuth,
    AccountList: accounts || [],
    Seed: seed,
  }),
);
