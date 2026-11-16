import { createRootRouteWithContext } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "../components/app-shell.tsx";
import { Empty } from "../components/page.tsx";
import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFound,
});

function NotFound() {
  const { t } = useTranslation();
  return <Empty>{t("shell.notFound")}</Empty>;
}
