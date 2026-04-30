import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const welcomeSource = readFileSync(new URL("../src/components/game/WelcomeScreen.tsx", import.meta.url), "utf8");

function importBlocks(source) {
  return source.match(/^import[\s\S]*?;$/gm) ?? [];
}

function runtimeImports(source) {
  return importBlocks(source).filter((block) => !/^import\s+type\b/.test(block));
}

test("the app route lazy-loads game-only panels out of the initial bundle", () => {
  const heavySpecifiers = [
    "@/components/game/PlayerCardCompact",
    "@/components/game/DialogArea",
    "@/components/game/VoiceCreditToggle",
    "@/components/game/Notebook",
    "@/components/game/PlayerDetailModal",
    "@/components/game/RoleRevealOverlay",
    "@/components/game/NightActionOverlay",
    "@/components/game/TutorialOverlay",
    "@/components/game/SettingsModal",
    "@/components/DevTools",
    "@/components/DevTools/DevConsole",
  ];

  const imports = runtimeImports(pageSource);

  for (const specifier of heavySpecifiers) {
    const hasStaticImport = imports.some(
      (block) => block.includes(`from "${specifier}"`) || block.includes(`from '${specifier}'`),
    );
    assert.equal(hasStaticImport, false, `${specifier} should not be statically imported by src/app/page.tsx`);
  }
});

test("the welcome screen can render the dev button without importing the full dev console", () => {
  const imports = runtimeImports(welcomeSource);
  const hasDevToolsBarrelImport = imports.some(
    (block) => block.includes('from "@/components/DevTools"') || block.includes("from '@/components/DevTools'"),
  );

  assert.equal(hasDevToolsBarrelImport, false, "WelcomeScreen should import the small DevModeButton directly");
});
