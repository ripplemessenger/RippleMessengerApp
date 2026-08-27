import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import { selectTagBulletins } from "../selectors";
import { RequestTagBulletin } from "../store/sagas/messenger.actions";

/**
 * TagBulletins — displays bulletins filtered by a specific tag.
 * Accessed via route.params.tag. Thin wrapper over the shared
 * BulletinListScreen (see docs/component-analysis.md).
 */
export default function TagBulletins({ route, navigation }) {
    const { t } = useTranslation();
    const { tag } = route.params ?? {};

    return (
        <BulletinListScreen
            navigation={navigation}
            selector={selectTagBulletins}
            loadAction={RequestTagBulletin}
            loadParams={{ tag }}
            guardParam="tag"
            icon="pricetag"
            title={tag ? `#${tag}` : t("ui.tag")}
            countText={(count) => t("ui.tag_count", { count })}
            emptyIcon="pricetag-outline"
            emptyTitle={t("ui.no_posts_found")}
            emptyHint={(ctx) =>
                tag ? ctx.t("ui.tag_no_posts", { tag }) : ctx.t("ui.tag_select")
            }
        />
    );
}
