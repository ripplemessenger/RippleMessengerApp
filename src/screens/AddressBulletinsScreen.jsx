import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import { selectAddressBulletins } from "../selectors";
import { LoadAddressBulletin } from "../store/sagas/messenger.actions";

/**
 * AddressBulletinsScreen — displays bulletins by a specific address.
 * Accessed via route.params.address. Thin wrapper over the shared
 * BulletinListScreen (see docs/component-analysis.md).
 */
export default function AddressBulletinsScreen({ route, navigation }) {
        const { t } = useTranslation();
        const { address } = route.params ?? {};

        return (
                <BulletinListScreen
                        navigation={navigation}
                        selector={selectAddressBulletins}
                        loadAction={LoadAddressBulletin}
                        loadParams={{ address }}
                        guardParam="address"
                        icon="person"
                        title={t("ui.address_posts")}
                        navTitle={address || "Address"}
                        headerExtra={
                                address ? (
                                        <Text className="text-xs font-mono text-text-secondary/50 mt-1">
                                                {address}
                                        </Text>
                                ) : null
                        }
                        countText={(count) => t("ui.posts_loaded", { count })}
                        emptyIcon="newspaper-outline"
                        emptyTitle={t("ui.no_posts_found")}
                        emptyHint={(ctx) =>
                                address
                                        ? ctx.t("ui.address_no_posts")
                                        : ctx.t("ui.no_address")
                        }
                />
        );
}
