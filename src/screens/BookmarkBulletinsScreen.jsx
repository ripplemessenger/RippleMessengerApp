import React from "react";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import { selectBookmarkBulletins } from "../selectors";
import { LoadBookmarkBulletin } from "../store/sagas/messenger.actions";

/**
 * BookmarkBulletins — displays all bookmarked (marked) bulletins.
 * Thin wrapper over the shared BulletinListScreen.
 */
export default function BookmarkBulletins({ navigation }) {
    const { t } = useTranslation();

    return (
        <BulletinListScreen
            navigation={navigation}
            selector={selectBookmarkBulletins}
            loadAction={LoadBookmarkBulletin}
            icon="star"
            title={t("ui.bookmarks")}
            countText={(count) => t("ui.bookmarked_count", { count })}
            emptyIcon="star-outline"
            emptyTitle={t("ui.no_bookmarks")}
            emptyHint={t("ui.bookmark_hint")}
        />
    );
}
