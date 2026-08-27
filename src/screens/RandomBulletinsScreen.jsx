import React from "react";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import { selectRandomBulletins } from "../selectors";
import { RequestRandomBulletin } from "../store/sagas/messenger.actions";

/**
 * RandomBulletinsScreen — displays random bulletins fetched from the network.
 * Flat list (no pagination). Thin wrapper over the shared BulletinListScreen.
 */
export default function RandomBulletinsScreen({ navigation }) {
    const { t } = useTranslation();

    return (
        <BulletinListScreen
            navigation={navigation}
            selector={selectRandomBulletins}
            loadAction={RequestRandomBulletin}
            paginated={false}
            requireConn
            icon="shuffle"
            title={t("ui.random_posts")}
            countText={(count) => t("ui.random_count", { count })}
            emptyIcon="shuffle-outline"
            emptyTitle={t("ui.no_random")}
            emptyHint={(ctx) =>
                ctx.isConnected
                    ? ctx.t("ui.random_hint")
                    : ctx.t("ui.random_hint_disconnected")
            }
        />
    );
}
