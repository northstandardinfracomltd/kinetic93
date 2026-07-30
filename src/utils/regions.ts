export const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  "France": [
    "Auvergne-Rhône-Alpes",
    "Bourgogne-Franche-Comté",
    "Bretagne",
    "Centre-Val de Loire",
    "Corse",
    "Grand Est",
    "Hauts-de-France",
    "Île-de-France",
    "Normandie",
    "Nouvelle-Aquitaine",
    "Occitanie",
    "Pays de la Loire",
    "Provence-Alpes-Côte d'Azur",
    "Guadeloupe",
    "Guyane",
    "La Réunion",
    "Martinique",
    "Mayotte"
  ],
  "Espagne": [
    "Andalucía",
    "Aragón",
    "Principado de Asturias",
    "Illes Balears",
    "Canarias",
    "Cantabria",
    "Castilla-La Mancha",
    "Castilla y León",
    "Catalunya",
    "Comunitat Valenciana",
    "Extremadura",
    "Galicia",
    "La Rioja",
    "Comunidad de Madrid",
    "Región de Murcia",
    "Comunidad Foral de Navarra",
    "País Vasco (Euskadi)",
    "Ceuta",
    "Melilla"
  ],
  "Portugal": [
    "Norte",
    "Centro",
    "Área Metropolitana de Lisboa",
    "Alentejo",
    "Algarve",
    "Região Autónoma dos Açores",
    "Região Autónoma da Madeira"
  ],
  "Suisse": [
    "Aargau",
    "Appenzell Ausserrhoden",
    "Appenzell Innerrhoden",
    "Basel-Landschaft",
    "Basel-Stadt",
    "Bern / Berne",
    "Fribourg / Freiburg",
    "Genève",
    "Glarus",
    "Graubünden / Grigioni / Grischun",
    "Jura",
    "Luzern",
    "Neuchâtel",
    "Nidwalden",
    "Obwalden",
    "Sankt Gallen",
    "Schaffhausen",
    "Schwyz",
    "Solothurn",
    "Thurgau",
    "Ticino",
    "Uri",
    "Valais / Wallis",
    "Vaud",
    "Zug",
    "Zürich"
  ],
  "Luxembourg": [
    "Capellen",
    "Clervaux",
    "Diekirch",
    "Echternach",
    "Esch-sur-Alzette",
    "Grevenmacher",
    "Luxembourg",
    "Mersch",
    "Redange",
    "Remich",
    "Vianden",
    "Wiltz"
  ],
  "Belgique": [
    "Région bruxelloise / Brussels",
    "Région flamande / Flämische",
    "Région wallonne / Wallonische"
  ],
  "Monaco": [
    "Fontvieille",
    "La Condamine",
    "La Colle",
    "La Rousse",
    "Le Larvotto",
    "Les Révoires",
    "Monaco-Ville",
    "Monte-Carlo",
    "Moneghetti"
  ],
  "Royaume-Uni": [
    "England",
    "Scotland",
    "Wales (Cymru)",
    "Northern Ireland"
  ]
};

export function getRegionsForCountry(countryName: string): string[] {
  if (!countryName) return REGIONS_BY_COUNTRY["France"];
  const clean = countryName.trim().toLowerCase();
  if (clean === "france" || clean === "fr") return REGIONS_BY_COUNTRY["France"];
  if (clean === "belgique" || clean === "belgium" || clean === "be") return REGIONS_BY_COUNTRY["Belgique"];
  if (clean === "luxembourg" || clean === "lu") return REGIONS_BY_COUNTRY["Luxembourg"];
  if (clean === "monaco" || clean === "mc") return REGIONS_BY_COUNTRY["Monaco"];
  if (clean === "suisse" || clean === "switzerland" || clean === "ch") return REGIONS_BY_COUNTRY["Suisse"];
  if (clean === "royaume-uni" || clean === "united kingdom" || clean === "uk" || clean === "gb") return REGIONS_BY_COUNTRY["Royaume-Uni"];
  if (clean === "espagne" || clean === "españa" || clean === "es") return REGIONS_BY_COUNTRY["Espagne"];
  if (clean === "portugal" || clean === "pt") return REGIONS_BY_COUNTRY["Portugal"];
  
  const matchedKey = Object.keys(REGIONS_BY_COUNTRY).find(k => k.toLowerCase() === clean);
  if (matchedKey) return REGIONS_BY_COUNTRY[matchedKey];
  return REGIONS_BY_COUNTRY["France"];
}
