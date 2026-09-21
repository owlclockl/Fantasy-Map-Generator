export const en = {
  // Menu tabs
  tabs: {
    layers: "Layers",
    style: "Style",
    options: "Options",
    tools: "Tools",
    about: "About",
    customization: "Customization"
  },
  // Sticked menu buttons
  menu: {
    newMap: "New Map",
    export: "Export",
    save: "Save",
    load: "Load",
    zoomOut: "Zoom out",
    search: "Search",
    showMenu: "Click to show the Menu",
    hideMenu: "Click to hide the Menu",
    generateNew: "Generate a new map based on options",
    saveMap: "Save fully-functional map file",
    loadMap: "Load fully-functional map (.map or .gz formats)",
    resetZoom: "Reset map zoom",
    searchMap: "Search map and commands"
  },
  // Layers tab
  layers: {
    preset: "Layers preset:",
    displayed: "Displayed layers and layer order:",
    tip1: "Click to toggle, drag to raise or lower the layer",
    tip2: "Ctrl + click to edit layer style",
    viewMode: "View mode:",
    standard: "Standard",
    scene3d: "3D scene",
    globe: "Globe",
    presets: {
      political: "Political map",
      cultural: "Cultural map",
      religions: "Religions map",
      provinces: "Provinces map",
      biomes: "Biomes map",
      heightmap: "Heightmap",
      physical: "Physical map",
      poi: "Places of interest",
      goods: "Goods map",
      trade: "Trade animation",
      military: "Military map",
      emblems: "Emblems",
      landmass: "Pure landmass"
    }
  },
  // Options tab sections
  options: {
    mapSettings: "Map settings (apply to new maps):",
    mapSize: "Map size",
    mapSeed: "Map seed",
    pointsNumber: "Points number",
    heightmap: "Heightmap",
    culturesNumber: "Cultures number",
    culturesSet: "Cultures set",
    statesNumber: "States number",
    provincesRatio: "Provinces ratio",
    sizeVariety: "Size variety",
    growthRate: "Growth rate",
    burgsNumber: "Burgs number",
    religionsNumber: "Religions number",
    interfaceSettings: "Interface settings:",
    interfaceSize: "Interface size",
    tooltipSize: "Tooltip size",
    themeColor: "Theme color",
    transparency: "Transparency",
    autosaveInterval: "Autosave interval",
    onLoad: "On load",
    performance: "Performance",
    assistant: "Azgaar assistant",
    speakerVoice: "Speaker voice",
    emblemShape: "Emblem shape",
    viewportSize: "Viewport size",
    zoomExtent: "Zoom extent",
    language: "Language",
    languageTip: "Select interface language",
    configureWorld: "Configure World",
    setLore: "Set Lore",
    resetOptions: "Reset Options",
    generateRandom: "Generate random map",
    openLastSaved: "Open last saved map",
    quality: "Quality",
    balance: "Balance",
    speed: "Speed",
    show: "Show",
    hide: "Hide",
    restoreDefault: "Restore default",
    fitToWindow: "Fit the viewport to the browser window",
    // Culture sets
    cultureSets: {
      world: "All-world",
      european: "European",
      oriental: "Oriental",
      english: "English",
      antique: "Antique",
      highFantasy: "High Fantasy",
      darkFantasy: "Dark Fantasy",
      random: "Random"
    }
  },
  // Tools
  tools: {
    title: "Tools and editors",
    heightmap: "Heightmap",
    biomes: "Biomes",
    cultures: "Cultures",
    states: "States",
    provinces: "Provinces",
    religions: "Religions",
    burgs: "Burgs",
    rivers: "Rivers",
    routes: "Routes",
    labels: "Labels",
    markers: "Markers",
    zones: "Zones",
    relief: "Relief",
    coastline: "Coastline",
    lakes: "Lakes",
    units: "Military",
    emblems: "Emblems",
    notes: "Notes",
    namebase: "Namebase"
  },
  // Loading
  loading: {
    text: "LOADING",
    generating: "Generating world",
    rendering: "Rendering map"
  },
  // Performance / threading
  performance: {
    title: "Performance & Threading",
    threading: "Multithreading",
    threadingTip: "Use Web Workers for heavy calculations",
    workers: "Worker threads",
    workersTip: "Number of parallel worker threads",
    enabled: "Enabled",
    disabled: "Disabled",
    auto: "Auto",
    status: "Threading status",
    activeWorkers: "Active workers",
    tasksCompleted: "Tasks completed"
  },
  // Dialogs
  dialogs: {
    confirm: "Confirm",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    load: "Load",
    yes: "Yes",
    no: "No",
    ok: "OK"
  },
  // About
  about: {
    title: "About Fantasy Map Generator",
    description: "Free web app that helps fantasy writers, game masters, and cartographers create and edit fantasy maps"
  }
} as const;

export type TranslationKeys = typeof en;
export type Language = "en" | "ru";

// Type that allows any string values but same keys
type Stringify<T> = T extends string ? string : T extends object ? { [K in keyof T]: Stringify<T[K]> } : T;
export type TranslationDict = Stringify<typeof en>;
