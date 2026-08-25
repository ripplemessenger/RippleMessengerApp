import { createSlice } from "@reduxjs/toolkit";

const CommonSlice = createSlice({
  name: "Common",
  initialState: {
    FlashNoticeMessage: null,
    FlashNoticeDuration: 0,
  },
  reducers: {
    setFlashNoticeMessage: (state, action) => {
      state.FlashNoticeMessage = action.payload.message;
      state.FlashNoticeDuration = action.payload.duration;
    },
  },
});

export const { setFlashNoticeMessage } = CommonSlice.actions;
export default CommonSlice.reducer;
