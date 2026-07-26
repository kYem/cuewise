import type { FocusImageCategory } from '@cuewise/shared';

/**
 * One curated background photo. Colocating the credit with the id means an entry
 * can't drift from its attribution; new metadata (alt text, placeholder color)
 * lands here as additive fields.
 *
 * Every entry was verified against its live unsplash.com photo page (og:image id
 * match) and its CDN URL confirmed reachable at the time it was added.
 */
export interface CuratedPhoto {
  id: string;
  /** Null when unverified — a wrong name is worse than none. */
  photographer: string | null;
  username: string | null;
  /** The place tag from the photo's Unsplash page; null when the page has none. */
  location: string | null;
}
export const CURATED_PHOTOS: Record<FocusImageCategory, CuratedPhoto[]> = {
  nature: [
    // Mountain lake sunrise
    {
      id: 'photo-1469474968028-56623f02e42e',
      photographer: 'Urban Vintage',
      username: 'urban_vintage',
      location: 'Ciucaș Peak, Romania',
    },
    // Forest valley
    {
      id: 'photo-1426604966848-d7adac402bff',
      photographer: 'Adam Kool',
      username: 'adamkool',
      location: 'El Cap, Yosemite National Park, United States',
    },
    // Foggy mountains
    {
      id: 'photo-1470071459604-3b5ec3a7fe05',
      photographer: 'v2osk',
      username: 'v2osk',
      location: null,
    },
    // Green hills
    {
      id: 'photo-1472214103451-9374bd1c798e',
      photographer: 'Robert Lukeman',
      username: 'robertlukeman',
      location: 'Skye, United Kingdom',
    },
    // Waterfall
    {
      id: 'photo-1433086966358-54859d0ed716',
      photographer: 'Blake Verdoorn',
      username: 'blakeverdoorn',
      location: null,
    },
    // Aerial forest
    {
      id: 'photo-1501854140801-50d01698950b',
      photographer: 'Qingbao Meng',
      username: 'ideasboom',
      location: null,
    },
    // Sunlit forest
    {
      id: 'photo-1441974231531-c6227db76b6e',
      photographer: 'Lukasz Szmigiel',
      username: 'szmigieldesign',
      location: null,
    },
    // Mountain reflection
    {
      id: 'photo-1475924156734-496f6cac6ec1',
      photographer: 'Quino Al',
      username: 'quinoal',
      location: 'Playa de la Misericordia, Spain',
    },
    // Valley vista
    {
      id: 'photo-1465056836041-7f43ac27dcb5',
      photographer: 'Tobias Keller',
      username: 'tokeller',
      location: 'Lake Tekapo, New Zealand',
    },
    // misty mountain valley
    {
      id: 'photo-1759061003114-337938a8a004',
      photographer: 'Tobias Pfeifer',
      username: 'tobi_sap',
      location: 'Teneriffa, Spanien',
    },
    // lush green valley
    {
      id: 'photo-1754637024977-368665e88caf',
      photographer: 'Paolo Boaretto',
      username: 'paolo1971',
      location: null,
    },
    // pastel sunrise peaks
    {
      id: 'photo-1772733694354-3b4a33568ef4',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Italy',
    },
    // rolling green hills
    {
      id: 'photo-1759759260780-f09be8608b53',
      photographer: 'paws and prints',
      username: 'paws_and_prints',
      location: 'Diamond Hill, Connemara National Park, Letterfrack, County Galway, Irland',
    },
    // grassy sunlit hills
    {
      id: 'photo-1749350902665-efefbfc84fd4',
      photographer: 'Fadhil Abhimantra',
      username: 'fabhimantra',
      location: 'Sumba Timur, East Nusa Tenggara, Indonesia',
    },
    // mountain lake sunrise
    {
      id: 'photo-1755643842005-460e3a030102',
      photographer: 'Emma Swoboda',
      username: 'emmakphoto',
      location: 'Trillium Lake, Oregon, USA',
    },
    // calm tarn reflection
    {
      id: 'photo-1759434190960-87511b2a5e5c',
      photographer: 'Jonny Gios',
      username: 'supergios',
      location: 'Blea Tarn, Ambleside, UK',
    },
    // mountain mirror lake
    {
      id: 'photo-1750779940369-2b817adea9d7',
      photographer: 'Colin Watts',
      username: 'colinwatts',
      location: 'Iceland',
    },
    // silky woodland waterfall
    {
      id: 'photo-1736616645685-a88b3ecda98c',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Norway',
    },
    // peaceful lake waterfall
    {
      id: 'photo-1432405972618-c60b0225b8f9',
      photographer: 'Jeffrey Workman',
      username: 'jeffreyp',
      location: null,
    },
  ],
  forest: [
    // Forest path
    {
      id: 'photo-1448375240586-882707db888b',
      photographer: 'Sebastian Unrau',
      username: 'sebastian_unrau',
      location: 'Bad Pyrmont, Deutschland',
    },
    // Green forest
    {
      id: 'photo-1542273917363-3b1817f69a2d',
      photographer: 'Marita Kavelashvili',
      username: 'maritaextrabold',
      location: 'Adjara, Georgia',
    },
    // Misty forest
    {
      id: 'photo-1511497584788-876760111969',
      photographer: 'Sergei A',
      username: 'sakulich',
      location: 'Rampart Lakes, United States',
    },
    // Redwood trees
    {
      id: 'photo-1440342359743-84fcb8c21f21',
      photographer: 'kazuend',
      username: 'kazuend',
      location: null,
    },
    // Autumn forest
    {
      id: 'photo-1473448912268-2022ce9509d8',
      photographer: 'Luca Bravo',
      username: 'lucabravo',
      location: 'Lago di Braies',
    },
    // Sunbeams through trees
    {
      id: 'photo-1502082553048-f009c37129b9',
      photographer: 'niko photos',
      username: 'niko_photos',
      location: 'Nicaragua',
    },
    // Forest stream
    {
      id: 'photo-1476231682828-37e571bc172f',
      photographer: 'Geranimo',
      username: 'geraninmo',
      location: 'Gävle, Sweden',
    },
    // Dense woodland
    {
      id: 'photo-1425913397330-cf8af2ff40a1',
      photographer: 'Steven Kamenar',
      username: 'skamenar',
      location: null,
    },
    // Bamboo forest
    {
      id: 'photo-1503435824048-a799a3a84bf7',
      photographer: 'Filip Zrnzević',
      username: 'filipz',
      location: 'Goč, Serbia',
    },
    // Foggy pine forest
    {
      id: 'photo-1523712999610-f77fbcfc3843',
      photographer: 'Johannes Plenio',
      username: 'jplenio',
      location: null,
    },
    // foggy evergreen forest
    {
      id: 'photo-1765871320521-7eb7c98a1061',
      photographer: 'Roberto Shumski',
      username: 'robshumski',
      location: null,
    },
    // dark misty pines
    {
      id: 'photo-1764111812995-b73ff58fc7d7',
      photographer: 'Dmitry Spravko',
      username: 'kaprion',
      location: 'Vancouver, BC, Canada',
    },
    // sunlit pine trail
    {
      id: 'photo-1752230446597-a5b08f8647e4',
      photographer: 'Gavin Allanwood',
      username: 'fp4',
      location: 'Ainsdale, Southport, UK',
    },
    // misty forested slope
    {
      id: 'photo-1758642882005-447873fd2d29',
      photographer: 'Andrea Caramello',
      username: 'andreacaramello',
      location: null,
    },
    // winter forest sunbeams
    {
      id: 'photo-1769006352025-1a429e69398f',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
      location: 'Schweiz',
    },
    // fog shrouded evergreens
    {
      id: 'photo-1755398104848-2f8da6532e4d',
      photographer: 'Emma Swoboda',
      username: 'emmakphoto',
      location: 'Mount Rainier, MD, USA',
    },
    // misty sunlit path
    {
      id: 'photo-1760479099643-b37a52e7c094',
      photographer: 'Ingmar',
      username: 'visualsbying',
      location: null,
    },
    // misty pine path
    {
      id: 'photo-1762085337173-cca26f2265bf',
      photographer: 'Alex varela',
      username: 'alexvarelo',
      location: null,
    },
    // foggy forest trail
    {
      id: 'photo-1693967325401-b841b7c0dd83',
      photographer: 'Peter Robbins',
      username: 'prphotography262',
      location: 'Mount Baker–Snoqualmie National Forest, Washington, USA',
    },
    // ferny forest trail
    {
      id: 'photo-1685330187195-1bae2038f3c4',
      photographer: 'Peter Robbins',
      username: 'prphotography262',
      location: 'Olympic National Forest, Washington, USA',
    },
  ],
  ocean: [
    // Ocean waves
    {
      id: 'photo-1505142468610-359e7d316be0',
      photographer: 'Shifaaz Shamoon',
      username: 'sotti',
      location: 'Maldives',
    },
    // Beach sunset
    {
      id: 'photo-1507525428034-b723cf961d3e',
      photographer: 'Sean Oulashin',
      username: 'oulashin',
      location: 'North Shore, Waialua, United States',
    },
    // Calm sea
    {
      id: 'photo-1439405326854-014607f694d7',
      photographer: 'Joseph Barrientos',
      username: 'jbcreate_',
      location: 'Tel Aviv-Yafo, Israel',
    },
    // Turquoise water
    {
      id: 'photo-1518837695005-2083093ee35b',
      photographer: 'Matt Hardy',
      username: 'matthardy',
      location: 'Bondi Beach, Australia',
    },
    // Ocean horizon
    {
      id: 'photo-1484291470158-b8f8d608850d',
      photographer: 'Christoffer Engström',
      username: 'christoffere',
      location: null,
    },
    // Tropical beach
    {
      id: 'photo-1519046904884-53103b34b206',
      photographer: 'Elizeu Dias',
      username: 'elishavision',
      location: 'Rio de Janeiro, Brazil',
    },
    // Beach aerial
    {
      id: 'photo-1506929562872-bb421503ef21',
      photographer: 'Gaddafi Rusli',
      username: 'gaddafirusli',
      location: 'Perhentian Islands, Malaysia',
    },
    // Coastal rocks
    {
      id: 'photo-1468413253725-0d5181091126',
      photographer: 'Rowan Heuvel',
      username: 'insolitus',
      location: 'Playa Blanca, Saboga, Panama',
    },
    // Sea waves
    {
      id: 'photo-1494791368093-85217fbbf8de',
      photographer: 'Michael Dam',
      username: 'michaeldam',
      location: 'Faroe Islands',
    },
    // dunes meet ocean
    {
      id: 'photo-1744024400385-462f45c02633',
      photographer: 'Max Böhme',
      username: 'max_boehme',
      location:
        'Spiaggia di Torre Guaceto, Riserva Naturale Torre Guaceto, Carovigno, Brindisi, Italien',
    },
    // pastel beach calm
    {
      id: 'photo-1744783720264-a7c4d54b155c',
      photographer: 'Karl Moore',
      username: 'karl333',
      location: null,
    },
    // ocean sunset horizon
    {
      id: 'photo-1556117182-70eb78020e91',
      photographer: 'Crest Lee',
      username: 'crest712',
      location: null,
    },
    // calm sunset sea
    {
      id: 'photo-1772424131868-6b9f154b59ce',
      photographer: 'Marwan Abdalah',
      username: 'marwan_abdalah',
      location: 'Rancho Palos Verdes, Rancho Palos Verdes, United States',
    },
    // turquoise wave aerial
    {
      id: 'photo-1744648617182-519c4bf39e30',
      photographer: 'Hameen Reynolds',
      username: 'hameen',
      location: null,
    },
    // sandy coastline aerial
    {
      id: 'photo-1774142532286-2ae46f0c3563',
      photographer: 'Iain',
      username: 'photoken123',
      location: null,
    },
    // waves washing shore
    {
      id: 'photo-1770110628704-86ba8c7b3b1c',
      photographer: 'Ahmed Saeed',
      username: 'anmadezzzzz',
      location: null,
    },
    // aerial beach waves
    {
      id: 'photo-1758213755328-c4b3912bf5cb',
      photographer: 'Kristaps Ungurs',
      username: 'kristapsungurs',
      location: 'Latvia',
    },
    // turquoise cliff coast
    {
      id: 'photo-1753188354738-2850c4a7196b',
      photographer: 'Georgii Eletskikh',
      username: 'elegeo',
      location: null,
    },
    // turquoise sea stacks
    {
      id: 'photo-1759660022306-a78006fb8d0a',
      photographer: 'Raymond Petrik',
      username: 'raymondpetrik',
      location: null,
    },
  ],
  mountains: [
    // Mountain peak
    {
      id: 'photo-1464822759023-fed622ff2c3b',
      photographer: 'Kalen Emsley',
      username: 'kalenemsley',
      location: 'Kluane National Park and Reserve of Canada, Canada',
    },
    // Snow mountains
    {
      id: 'photo-1506905925346-21bda4d32df4',
      photographer: 'Sam Ferrara',
      username: 'samferrara',
      location: 'Weisshorn, Randa, Switzerland',
    },
    // Mountain range
    {
      id: 'photo-1454496522488-7a8e488e8606',
      photographer: 'Rohit Tandon',
      username: 'sepoys',
      location: 'Amadablam Expedition, काठमाडौँ, Nepal',
    },
    // Starry mountains
    {
      id: 'photo-1519681393784-d120267933ba',
      photographer: 'Benjamin Voros',
      username: 'vorosbenisop',
      location: 'Moena, Italy',
    },
    // Alpine lake
    {
      id: 'photo-1486870591958-9b9d0d1dda99',
      photographer: 'Jeremy Bishop',
      username: 'jeremybishop',
      location: 'Sierra Nevada, United States',
    },
    // Mountain mist
    {
      id: 'photo-1483728642387-6c3bdd6c93e5',
      photographer: 'Daniel Leone',
      username: 'danielleone',
      location: 'Poon Hill, Ghode Pani, Nepal',
    },
    // Rocky peaks
    {
      id: 'photo-1434394354979-a235cd36269d',
      photographer: 'Ales Krivec',
      username: 'aleskrivec',
      location: null,
    },
    // Mountain meadow
    {
      id: 'photo-1445363692815-ebcd599f7621',
      photographer: 'Cagatay Orhan',
      username: 'cagatayorhan',
      location: null,
    },
    // Swiss Alps
    {
      id: 'photo-1458668383970-8ddd3927deed',
      photographer: 'samsommer',
      username: 'samsommer',
      location: 'Bunderspitz, Adelboden, Switzerland',
    },
    // Misty mountains
    {
      id: 'photo-1477346611705-65d1883cee1e',
      photographer: 'John Towner',
      username: 'heytowner',
      location: 'Ancient Bristlecone Pine Forest, United States',
    },
    // alpine peaks dawn
    {
      id: 'photo-1780042426982-cb794203ea1d',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
      location: 'Schweiz',
    },
    // snowy dolomites twilight
    {
      id: 'photo-1769631417306-a1da09f42b20',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Bolzano, Autonomous Province of Bolzano – South Tyrol, Italy',
    },
    // sunrise above fog
    {
      id: 'photo-1762181702079-40f2f9ac56e4',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
      location: 'Schweiz',
    },
    // golden snowcapped range
    {
      id: 'photo-1760340642096-fa5ccff5b8e4',
      photographer: 'Ryan Klaus',
      username: 'ryankphoto',
      location: 'Saint-Luc',
    },
    // foggy mountain ridges
    {
      id: 'photo-1759310386268-a5ee8a2f0cfa',
      photographer: 'Pichara',
      username: 'pichara',
      location: 'Dalat, Lam Dong, Vietnam',
    },
    // golden misty hills
    {
      id: 'photo-1758637689126-2598f5b17ceb',
      photographer: '志远 杨',
      username: 'yangzhiyuan',
      location: 'China, Guangdong, Jieyang, 普宁',
    },
    // tuscan misty sunrise
    {
      id: 'photo-1744272614586-ebab1f125903',
      photographer: 'Studio Pizza',
      username: 'studiopizza',
      location: null,
    },
    // jagged golden peaks
    {
      id: 'photo-1762886457614-98d4dc98f6ef',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Dolomiti, Rocca Pietore, Province of Belluno, Italy',
    },
    // dolomites sunset glow
    {
      id: 'photo-1727976971228-ee2e309c90c1',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Dolomites',
    },
  ],
  minimal: [
    // Gradient purple
    {
      id: 'photo-1557682250-33bd709cbe85',
      photographer: 'Luke Chesser',
      username: 'lukechesser',
      location: null,
    },
    // Abstract waves
    {
      id: 'photo-1558591710-4b4a1ae0f04d',
      photographer: 'Jean-Philippe Delberghe',
      username: 'jipy32',
      location: 'Clerkenwell, London, UK',
    },
    // Minimal gradient
    {
      id: 'photo-1557683316-973673baf926',
      photographer: 'Luke Chesser',
      username: 'lukechesser',
      location: null,
    },
    // Pink gradient
    {
      id: 'photo-1553356084-58ef4a67b2a7',
      photographer: 'Pawel Czerwinski',
      username: 'pawel_czerwinski',
      location: null,
    },
    // Blue gradient
    {
      id: 'photo-1557682224-5b8590cd9ec5',
      photographer: 'Luke Chesser',
      username: 'lukechesser',
      location: null,
    },
    // Colorful gradient
    {
      id: 'photo-1579546929518-9e396f3cc809',
      photographer: 'Codioful (Formerly Gradienta)',
      username: 'codioful',
      location: null,
    },
    // Soft gradient
    {
      id: 'photo-1557682260-96773eb01377',
      photographer: 'Luke Chesser',
      username: 'lukechesser',
      location: null,
    },
    // Geometric minimal
    {
      id: 'photo-1550684848-fac1c5b4e853',
      photographer: 'Rodion Kutsaiev',
      username: 'frostroomhead',
      location: 'Melitopol, Ukraine',
    },
    // Abstract blue
    {
      id: 'photo-1557683311-eac922347aa1',
      photographer: 'Luke Chesser',
      username: 'lukechesser',
      location: null,
    },
    // Soft pastel
    {
      id: 'photo-1528459801416-a9e53bbf4e17',
      photographer: 'Annie Spratt',
      username: 'anniespratt',
      location: null,
    },
    // blue white gradient
    {
      id: 'photo-1760865245520-21b0786f5236',
      photographer: 'Philipp Hubert',
      username: 'philipphubert',
      location: null,
    },
    // white wavy lines
    {
      id: 'photo-1741806914386-c60073a0fed3',
      photographer: 'Pawel Czerwinski',
      username: 'pawel_czerwinski',
      location: null,
    },
    // white sand dunes
    {
      id: 'photo-1765498067720-6ff6847f8f85',
      photographer: 'Royce Fonseca',
      username: 'casunshine0508',
      location: 'White Sands National Park, New Mexico, USA',
    },
    // soft dune curves
    {
      id: 'photo-1698471058817-a280ddf07704',
      photographer: 'Zetong Li',
      username: 'zetong',
      location: null,
    },
    // dunes blue hour
    {
      id: 'photo-1741813203115-e4a83fc6e9d5',
      photographer: 'Joseph Corl',
      username: 'jcorl',
      location: 'White Sands National Park, New Mexico, USA',
    },
    // serene sky gradient
    {
      id: 'photo-1650803321892-efba59b28a60',
      photographer: 'Chris Appano',
      username: 'chrisappano',
      location: null,
    },
    // purple green gradient
    {
      id: 'photo-1618397746666-63405ce5d015',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
      location: 'London, UK',
    },
    // smooth purple render
    {
      id: 'photo-1618556450994-a6a128ef0d9d',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
      location: 'Canada',
    },
    // colorful mesh gradient
    {
      id: 'photo-1618005182384-a83a8bd57fbe',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
      location: 'Colorado, USA',
    },
    // calm grey sea
    {
      id: 'photo-1760294750422-07572513d0de',
      photographer: 'Anna Hunko',
      username: 'annahunko',
      location: 'Ireland, Cliffs of Moher',
    },
  ],
  dark: [
    // Night sky stars
    {
      id: 'photo-1419242902214-272b3f66ee7a',
      photographer: 'Vincentiu Solomon',
      username: 'vincentiu',
      location: "Cima d'Asta, Scurelle, Italy",
    },
    // Dark forest
    {
      id: 'photo-1507400492013-162706c8c05e',
      photographer: 'Timothée Duran',
      username: 'timotheeduran',
      location: null,
    },
    // Night cityscape
    {
      id: 'photo-1472552944129-b035e9ea3744',
      photographer: 'Gregoire Jeanneau',
      username: 'gregjeanneau',
      location: null,
    },
    // Milky way
    {
      id: 'photo-1536183922588-166604504d5e',
      photographer: 'Kyle Johnson',
      username: 'kylejeffreys',
      location: 'Cannon Beach, United States',
    },
    // Night road
    {
      id: 'photo-1489549132488-d00b7eee80f1',
      photographer: 'Diego PH',
      username: 'jdiegoph',
      location: 'Toluca, Mexico',
    },
    // Starry night
    {
      id: 'photo-1475274047050-1d0c0975c63e',
      photographer: 'Paul Lichtblau',
      username: 'laup',
      location: null,
    },
    // Night forest
    {
      id: 'photo-1488866022504-f2584929ca5f',
      photographer: 'Nathan Anderson',
      username: 'nathananderson',
      location: 'Silverthorne, United States',
    },
    // milky way night
    {
      id: 'photo-1742626157111-59f3f1019a8a',
      photographer: 'Tobias Rademacher',
      username: 'tobbes_rd',
      location: 'Waipu, New Zealand',
    },
    // starry beach night
    {
      id: 'photo-1561009706-c90773f936f3',
      photographer: 'SR',
      username: 'lemonmelon',
      location: 'Pantai Malindo, Balik Pulau, Penang, Malaysia',
    },
    // stars over summit
    {
      id: 'photo-1510981023495-45fca86762e9',
      photographer: 'Phil Botha',
      username: 'philbotha',
      location: 'Key Summit, New Zealand',
    },
    // aurora coastal mountains
    {
      id: 'photo-1570470767483-286963cb60cf',
      photographer: 'Sami Matias Breilin',
      username: 'samimatias',
      location: null,
    },
    // aurora over forest
    {
      id: 'photo-1747633126452-dee49902fc6e',
      photographer: 'Zach Kessinger',
      username: 'wonderwallphotos',
      location: 'Colorado, USA',
    },
    // milky way mountains
    {
      id: 'photo-1593481118939-40dea95585ad',
      photographer: 'Joshua Woroniecki',
      username: 'joshuaworoniecki',
      location: 'Jasper, Alberta, Canada',
    },
    // meteor starry sky
    {
      id: 'photo-1599218419176-0daa21523249',
      photographer: 'Олег Мороз',
      username: 'tengyart',
      location: 'Russia',
    },
    // aurora snowy peaks
    {
      id: 'photo-1759675739458-6e5a4a60a117',
      photographer: 'Jonny Gios',
      username: 'supergios',
      location: 'Vestrahorn, Iceland',
    },
    // dark dusk silhouettes
    {
      id: 'photo-1741501769971-68e9b813509a',
      photographer: 'MChe Lee',
      username: 'mclee',
      location: null,
    },
    // aurora light burst
    {
      id: 'photo-1749033133028-7fb64bd38e07',
      photographer: 'Federico Bottos',
      username: 'landscapeplaces',
      location: 'Lofoten, Norvegia',
    },
    // multihued aurora night
    {
      id: 'photo-1531366936337-7c912a4589a7',
      photographer: 'Lightscape',
      username: 'lightscape',
      location: 'Tromsø, Norway',
    },
  ],
};
