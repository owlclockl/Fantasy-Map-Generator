// Azgaar and contributors, 2017-2026. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator
// Enhanced with multithreading, i18n (Russian), and modern UI

import "@/services/logging";
import "@/services/i18n";
import "@/components/globals";
import "@/components/options/tabs";

import "@/utils";
import "@/utils/worker-pool";
import "@/data/supporters";
import "@/data/heightmap-templates";
import "@/data/precreated-heightmaps";
import "@/generators";
import "@/renderers";
import "@/components";
import "@/controllers";
import "@/services";
import "@/generators/styles-legacy";

import { boot } from "@/components/lifecycle";

document.addEventListener("DOMContentLoaded", boot);
