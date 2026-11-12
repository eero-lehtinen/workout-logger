import { createRootRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "../components/app-shell.tsx";
import { Empty } from "../components/page.tsx";

export const Route = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFound,
});

function NotFound() {
  const { t } = useTranslation();
  return <Empty>{t("shell.notFound")}</Empty>;
}
