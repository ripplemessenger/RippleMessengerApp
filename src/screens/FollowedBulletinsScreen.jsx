import React from "react";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import { selectFollowBulletins } from "../selectors";
import { LoadFollowBulletin } from "../store/sagas/messenger.actions";

/**
 * FollowedBulletinsScreen — displays bulletins from accounts the user follows.
 * Thin wrapper over the shared BulletinListScreen.
 */
export default function FollowedBulletinsScreen({ navigation }) {
    const { t } = useTranslation();

    return (
        <BulletinListScreen
            navigation={navigation}
            selector={selectFollowBulletins}
            loadAction={LoadFollowBulletin}
            icon="people"
            title={t("ui.followed_posts")}
            countText={(count) => t("ui.followed_count", { count })}
            emptyIcon="people-outline"
            emptyTitle={t("ui.no_followed")}
            emptyHint={t("ui.follow_hint")}
        />
    );
}
