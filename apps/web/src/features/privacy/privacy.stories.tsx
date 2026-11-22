import type { Meta } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { empty } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Privacy",
} satisfies Meta;

/**
 * The notice the sign-in row and Google's consent screen link to: who the
 * controller is and how to reach them, what is stored on what basis and for
 * how long, and the rights with where to complain.
 */
export const Phone = pageStory({
  fixture: empty,
  url: () => "/privacy",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Alex Example, a private person in Finland/),
    ).toBeVisible();
    // The name and address Storybook's build is given (.storybook/main.ts).
    await expect(
      canvas.getByRole("link", { name: "privacy@example.com" }),
    ).toHaveAttribute("href", "mailto:privacy@example.com");
    await expect(canvas.getByText(/not end-to-end encrypted/)).toBeVisible();
    await expect(canvas.getByText(/the IP address/)).toBeVisible();
    await expect(
      canvas.getByText(/a virtual server in Germany, rented from/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "data processing terms" }),
    ).toHaveAttribute(
      "href",
      "https://www.cloudflare.com/cloudflare-customer-dpa/",
    );
    await expect(canvas.getByText(/only with your consent/)).toBeVisible();
    await expect(
      canvas.getByText("Monthly backups: deleted after 3 months"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "tietosuoja.fi" }),
    ).toHaveAttribute("href", "https://tietosuoja.fi");
    // Day and month order follow the browser's English locale.
    await expect(canvas.getByText(/^Updated .*2026\.$/)).toBeVisible();
  },
});

export const Finnish = pageStory({
  fixture: empty,
  url: () => "/privacy",
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/tietoja ei salata päästä päähän/),
    ).toBeVisible();
    await expect(canvas.getByText(/rekisterinpitäjä/)).toBeVisible();
    await expect(
      canvas.getByText(
        "Kuukausittaiset varmuuskopiot: poistetaan 3 kuukauden kuluttua",
      ),
    ).toBeVisible();
  },
});

export const Pc = pageStory({
  fixture: empty,
  url: () => "/privacy",
  viewport: "pc",
  theme: "dark",
});
