import type { FocusImageCategory } from '@cuewise/shared';
import type { HostedCategory } from './hosted-art';

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
export const CURATED_PHOTOS: Record<Exclude<FocusImageCategory, HostedCategory>, CuratedPhoto[]> = {
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
    // trees near lake
    {
      id: 'photo-1600298882283-40b4dcb8b211',
      photographer: 'Nathan Dumlao',
      username: 'nate_dumlao',
      location: null,
    },
    // trees beside lake
    {
      id: 'photo-1583244685026-d8519b5e3d21',
      photographer: 'Claudia Chiavazza',
      username: 'chiclaudia',
      location: 'Laghi di Fusine, Tarvisio, UD, Italia',
    },
    // lake surrounded by trees
    {
      id: 'photo-1507371341162-763b5e419408',
      photographer: 'Ricardo Gomez Angel',
      username: 'rgaleriacom',
      location: 'Horgenberg, Horgen, Switzerland',
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
    // sunlit pine trail
    {
      id: 'photo-1752230446597-a5b08f8647e4',
      photographer: 'Gavin Allanwood',
      username: 'fp4',
      location: 'Ainsdale, Southport, UK',
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
    // golden larch forest
    {
      id: 'photo-1508255139162-e1f7b7288ab7',
      photographer: 'Federica Galli',
      username: 'fedechanw',
      location: 'Lago di Sorapis, Italy',
    },
    // tree-lined path, golden hour
    {
      id: 'photo-1445855743215-296f71d4b49c',
      photographer: 'Lukasz Szmigiel',
      username: 'szmigieldesign',
      location: 'Biały Ług, Kędzierzyn-Koźle, Poland',
    },
    // brown trees on field
    {
      id: 'photo-1613985212734-166ffb5a513d',
      photographer: 'Konstantin Dyadyun',
      username: 'kostyadyadyun',
      location: null,
    },
    // road through autumn trees
    {
      id: 'photo-1700192569130-13f6b3dd0fca',
      photographer: 'Alexander Holmes',
      username: 'solar_al',
      location: null,
    },
    // autumn path, misty forest
    {
      id: 'photo-1445964047600-cdbdb873673d',
      photographer: 'Sebastian Unrau',
      username: 'sebastian_unrau',
      location: 'Bad Pyrmont, Deutschland',
    },
    // blurred autumn foliage
    {
      id: 'photo-1759806642296-5ba05e043d84',
      photographer: 'Eugene Golovesov',
      username: 'eugene_golovesov',
      location: null,
    },
    // moss-covered rock
    {
      id: 'photo-1692065976427-9e97e653e02a',
      photographer: 'Brice Cooper',
      username: 'brice_cooper18',
      location: null,
    },
    // sunlight through green forest
    {
      id: 'photo-1761461922930-9afd5bf09593',
      photographer: 'Jean Woloszczyk',
      username: 'jeanwolo',
      location: null,
    },
    // sunlight through canopy
    {
      id: 'photo-1762284499277-eff8dba45c02',
      photographer: 'Teodora Vaklinska',
      username: 'tea_in_deventer',
      location: 'Sallandse Heuvelrug, Netherlands',
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
    // snowy dolomites twilight
    {
      id: 'photo-1769631417306-a1da09f42b20',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
      location: 'Bolzano, Autonomous Province of Bolzano – South Tyrol, Italy',
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
    // fog-covered mountains
    {
      id: 'photo-1483354483454-4cd359948304',
      photographer: 'Paul Earle',
      username: 'paulearlephotography',
      location: 'Snowdonia National Park, United Kingdom',
    },
    // mountain near water
    {
      id: 'photo-1523248948644-586f1ab2a83e',
      photographer: 'Tyler Lastovich',
      username: 'lastly',
      location: 'Lake Hauroko, New Zealand',
    },
    // turquoise lake, snowy peaks
    {
      id: 'photo-1559310589-2673bfe16970',
      photographer: 'Adam Vradenburg',
      username: 'vradenburg',
      location: null,
    },
    // snowy peak, calm lake
    {
      id: 'photo-1778510092958-c952c661b807',
      photographer: 'Timo Wielink',
      username: 'timowielink',
      location: 'Lake Wenatchee, Washington, USA',
    },
    // snowy peaks reflected
    {
      id: 'photo-1787117754799-75c2b97d66a8',
      photographer: 'Gabor Koszegi',
      username: 'gabor_koszegi',
      location: 'Two Jack Lake, Improvement District No. 9, AB, Canada',
    },
    // Moraine Lake
    {
      id: 'photo-1506104489822-562ca25152fe',
      photographer: 'Redd Francisco',
      username: 'reddfrancisco',
      location: 'Moraine Lake, Canada',
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
    // Colorful gradient
    {
      id: 'photo-1579546929518-9e396f3cc809',
      photographer: 'Codioful (Formerly Gradienta)',
      username: 'codioful',
      location: null,
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
    // snow-covered pine
    {
      id: 'photo-1518972734183-c5b490a7c637',
      photographer: 'Cristina Gottardi',
      username: 'cristina_gottardi',
      location: null,
    },
    // lone tree on hill
    {
      id: 'photo-1705435896415-933b94be4ea5',
      photographer: 'Mojtaba Mohammadi',
      username: 'mojitaba',
      location: 'Iran',
    },
    // small boat, calm sea
    {
      id: 'photo-1761943840939-ad36457f54a0',
      photographer: 'Eduard Galitskiy',
      username: 'echogolf',
      location: null,
    },
    // lone house in snow
    {
      id: 'photo-1641247940945-b8329abedc00',
      photographer: 'Luca Pozzoli',
      username: 'pozlu0',
      location: null,
    },
    // grayscale lone tree
    {
      id: 'photo-1609668627336-4fee026204f7',
      photographer: 'Jan Huber',
      username: 'jan_huber',
      location: null,
    },
    // white dunes, distant range
    {
      id: 'photo-1765498069280-b863094c17bf',
      photographer: 'Royce Fonseca',
      username: 'casunshine0508',
      location: 'White Sands National Park, New Mexico, USA',
    },
    // white concrete house
    {
      id: 'photo-1503450843813-359b7b07bd36',
      photographer: 'Raychan',
      username: 'wx1993',
      location: null,
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
    // Milky way
    {
      id: 'photo-1536183922588-166604504d5e',
      photographer: 'Kyle Johnson',
      username: 'kylejeffreys',
      location: 'Cannon Beach, United States',
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
    // aurora snowy peaks
    {
      id: 'photo-1759675739458-6e5a4a60a117',
      photographer: 'Jonny Gios',
      username: 'supergios',
      location: 'Vestrahorn, Iceland',
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
    // grayscale beach waves
    {
      id: 'photo-1514695307237-bfad60f67684',
      photographer: 'Matt Hardy',
      username: 'matthardy',
      location: 'Bondi Beach, Australia',
    },
    // thunderstorm clouds
    {
      id: 'photo-1516490981167-dc990a242afe',
      photographer: 'Josep Castells',
      username: 'paniscusbcn',
      location: null,
    },
    // dark storm clouds
    {
      id: 'photo-1560928863-e140ee0fc733',
      photographer: 'Paul Zoetemeijer',
      username: 'paul_1865',
      location: null,
    },
    // storm over water
    {
      id: 'photo-1584820537082-8e19daff36bd',
      photographer: 'Daniel Lerman',
      username: 'dlerman6',
      location: 'Koh Samui, Ko Samui District, Provincia de Surat Thani, Tailandia',
    },
    // lightning on water
    {
      id: 'photo-1600377927594-ceae8f8981a6',
      photographer: 'Raychel Sanner',
      username: 'raychelsnr',
      location: null,
    },
  ],
  countryside: [
    // rural village in green valley
    {
      id: 'photo-1774304233896-62d078d03673',
      photographer: 'Sebastian S',
      username: 'izeberg',
      location: 'Nagano Prefecture, Japan',
    },
    // grass field under blue sky
    {
      id: 'photo-1584441695492-71ce0b7aecbe',
      photographer: 'enkuu smile',
      username: 'enkuu',
      location: null,
    },
    // houses and rice paddies valley
    {
      id: 'photo-1559439080-b6037bc5f8fb',
      photographer: 'Rap Dela Rea',
      username: 'rapdelarea',
      location: 'Shirakawa-Go, Japan',
    },
    // fluffy white clouds
    {
      id: 'photo-1765112377086-bf92696f0b72',
      photographer: 'Bulat Akhtiamov',
      username: 'richard_29',
      location: null,
    },
    // grassy hill, large clouds
    {
      id: 'photo-1787670121807-aa1cac7a1544',
      photographer: 'Tao Yuan',
      username: 'peek_a_boo_who',
      location: 'lanqab, Inner Mongolia',
    },
    // clouds above open field
    {
      id: 'photo-1778294411660-5dd9e24daa03',
      photographer: 'Ryan Wu',
      username: 'nzw897',
      location: null,
    },
    // trees under white clouds
    {
      id: 'photo-1597216101660-cae6b98ae212',
      photographer: 'Kirill Yermakov',
      username: 'kirkarma',
      location: null,
    },
    // dirt path through grassy field
    {
      id: 'photo-1758612181584-ea4fad017752',
      photographer: 'Just Jus',
      username: 'onejus',
      location: 'RAF Greenham Common, Thatcham, UK',
    },
    // train track through rural area
    {
      id: 'photo-1710243543164-0345af2d2167',
      photographer: 'Tsuyoshi Kozu',
      username: 'tsuyoshikozu',
      location: null,
    },
    // train beside forest
    {
      id: 'photo-1710243543195-dd4e8581bd66',
      photographer: 'Tsuyoshi Kozu',
      username: 'tsuyoshikozu',
      location: null,
    },
    // train through green countryside
    {
      id: 'photo-1725139069066-2c0796ca2579',
      photographer: 'Marton Voros',
      username: 'martonvoros',
      location: null,
    },
    // small cabin in field
    {
      id: 'photo-1682682586841-9c2169cb9612',
      photographer: 'Tomáš Hirsch',
      username: 'tomashirsch',
      location: 'Alto Adige, Italy',
    },
    // cabin in meadow, mountains
    {
      id: 'photo-1686518110219-c51aa1a76a2a',
      photographer: 'Tomáš Hirsch',
      username: 'tomashirsch',
      location: 'Alpe di Siusi, Italy',
    },
    // thatched-roof house
    {
      id: 'photo-1682516086739-c3fbf844529b',
      photographer: 'Karen Cann',
      username: 'karenjac',
      location: 'Houghton, Huntingdon, Cambridgeshire, UK',
    },
    // rice terraces in daylight
    {
      id: 'photo-1548710332-3e03e8220a79',
      photographer: 'Sebastian Herrmann',
      username: 'herrherrmann',
      location: 'Sagada Rice Terraces, Sagada, Philippines',
    },
    // small village in valley
    {
      id: 'photo-1663265159276-9f716dda0e83',
      photographer: 'Rondell Chaz Mabunga',
      username: 'chazmabunga',
      location: null,
    },
  ],
  cars: [
    // vintage cream car, desert road
    {
      id: 'photo-1765211003784-a82564cb8d3d',
      photographer: 'Wesley Tingey',
      username: 'wesleyphotography',
      location: null,
    },
    // turquoise convertible on road
    {
      id: 'photo-1779226871405-843a391c70bc',
      photographer: 'Roger Starnes Sr',
      username: 'rstar50',
      location: null,
    },
    // orange Challenger, gravel road
    {
      id: 'photo-1604940500627-d3f44d1d21c6',
      photographer: 'Alexandros Athanasopoulos',
      username: 'alexandros_ath',
      location: null,
    },
    // vintage Mustang, desert sunset
    {
      id: 'photo-1622319544231-ce84790b689a',
      photographer: 'Brendan Stephens',
      username: 'brendan_stephens',
      location: 'Palmdale, CA, USA',
    },
    // red Mustang, forest path
    {
      id: 'photo-1544896478-d5b709d413c5',
      photographer: 'Jakob Owens',
      username: 'jakobowens1',
      location: null,
    },
    // teal sedan by trees
    {
      id: 'photo-1533468659570-9cc9354310e4',
      photographer: 'Wade Lambert',
      username: 'wade_lambert',
      location: null,
    },
    // wet street at night
    {
      id: 'photo-1775144583501-1e20e7b9b4e4',
      photographer: 'Alexander Korte',
      username: 'stelath',
      location: 'Oyster Bar, Delancey Street, New York, NY, USA',
    },
    // wet highway at night
    {
      id: 'photo-1770756248904-6031ad07223f',
      photographer: 'Dmitrii Filatov',
      username: 'dmitrii_filatov',
      location: 'Almaty, Kazakhstan',
    },
    // car on dark road
    {
      id: 'photo-1763445727332-7c5c0e46e6e9',
      photographer: 'Enq 1998',
      username: 'enq_1998',
      location: null,
    },
    // car under starry sky
    {
      id: 'photo-1545642412-2fb9732aac99',
      photographer: 'Elias Andres-Jose',
      username: 'eliasandres',
      location: null,
    },
    // vehicle in desert at night
    {
      id: 'photo-1556634202-129a046351c0',
      photographer: 'Sid Balachandran',
      username: 'sid_balachandran',
      location: 'The Night Drive, Dubai, United Arab Emirates',
    },
    // black car, road at night
    {
      id: 'photo-1613713568305-8da2fc04f168',
      photographer: 'Mohammad Alizade',
      username: 'mohamadaz',
      location: null,
    },
    // black sedan at night
    {
      id: 'photo-1606512084153-189ffdc0f086',
      photographer: 'Patrick Schiele',
      username: 'schiepatrick',
      location: null,
    },
    // SUV on curved mountain road
    {
      id: 'photo-1469423910081-3488183dd77e',
      photographer: 'Nathan Anderson',
      username: 'nathananderson',
      location: 'US National Park Road, Grand Lake, United States',
    },
    // vintage sports car, Alpine road
    {
      id: 'photo-1794083123054-8a13c2f928ef',
      photographer: 'Rafael Peier',
      username: 'rafaelpeier',
      location: 'Berninapass, Poschiavo, Schweiz',
    },
    // car at mountain overlook
    {
      id: 'photo-1758311177480-62d7920cd01d',
      photographer: 'Viktor Stefanoski',
      username: '1zzy_st',
      location: 'Lake Kozjak & Dam Viewpoint, North Macedonia',
    },
    // car driving on road
    {
      id: 'photo-1650804200978-7140e0c4f15b',
      photographer: 'Paul Steiner',
      username: 'paul_steiner',
      location: null,
    },
  ],
  ai: [
    // crystal vase, pink flowers
    {
      id: 'photo-1717501218385-55bc3a95be94',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // water droplets
    {
      id: 'photo-1717501219417-bb1803e95c77',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // black and white light
    {
      id: 'photo-1717501218636-a390f9ac5957',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // glass sculpture
    {
      id: 'photo-1717501219781-54ac9d09051b',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // colorful abstract
    {
      id: 'photo-1717503159960-bf398715c19e',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // green plant mobile
    {
      id: 'photo-1718011087751-e82f1792aa32',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // circular object
    {
      id: 'photo-1717501219604-cc1902b5d845',
      photographer: 'Google DeepMind',
      username: 'googledeepmind',
      location: null,
    },
    // black cubes, glowing sphere
    {
      id: 'photo-1655499603560-6f834760f8d5',
      photographer: 'Andrew W',
      username: 'wandreww',
      location: null,
    },
    // cubes and yellow spheres
    {
      id: 'photo-1622737133809-d95047b9e673',
      photographer: 'Sebastian Svenson',
      username: 'sebastiansvenson',
      location: null,
    },
    // sphere of dots and lines
    {
      id: 'photo-1674027444485-cec3da58eef4',
      photographer: 'Growtika',
      username: 'growtika',
      location: null,
    },
    // teal spiral
    {
      id: 'photo-1650943574955-ac02c65cfc71',
      photographer: 'Dynamic Wang',
      username: 'dynamicwang',
      location: null,
    },
    // blue layered waves
    {
      id: 'photo-1627637819794-fba32f82be16',
      photographer: 'SIMON LEE',
      username: 'simonppt',
      location: null,
    },
    // blue abstract shapes
    {
      id: 'photo-1744130268168-a94003e431e6',
      photographer: 'Logan Voss',
      username: 'loganvoss',
      location: null,
    },
    // cluster of spheres
    {
      id: 'photo-1738082956213-aa554ba67bda',
      photographer: 'Logan Voss',
      username: 'loganvoss',
      location: null,
    },
    // dark blue squares
    {
      id: 'photo-1709626011485-6fe000ea2dbc',
      photographer: 'Pawel Czerwinski',
      username: 'pawel_czerwinski',
      location: null,
    },
    // spiral of discs
    {
      id: 'photo-1618172193763-c511deb635ca',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
      location: 'London, UK',
    },
  ],
  classical: [
    // busts in a dark library
    {
      id: 'photo-1782530707432-eb04674c3a5c',
      photographer: 'Jameson Berrios',
      username: 'simpoge',
      location: 'Dublin, Ireland',
    },
    // library shelves with busts
    {
      id: 'photo-1502700807168-484a3e7889d0',
      photographer: 'Alex Block',
      username: 'alexblock',
      location: 'Dublin, Ireland',
    },
    // David bust, dark pedestal
    {
      id: 'photo-1793820390948-5d3f91bd24b4',
      photographer: 'Liana S',
      username: 'cherstve_pechivo',
      location: null,
    },
    // robed bust, black wall
    {
      id: 'photo-1505663912202-ac22d4cb3707',
      photographer: 'Giammarco Boscaro',
      username: 'giamboscaro',
      location: 'Dublino, Irlanda',
    },
    // three busts, dim room
    {
      id: 'photo-1774611689206-2068bcac0d2e',
      photographer: 'Clary Garcia',
      username: 'ccgrc',
      location: 'Vatican Museums, Vatican City',
    },
    // rows of ancient busts
    {
      id: 'photo-1762223539113-85cb8410efce',
      photographer: 'Redd Francisco',
      username: 'reddfrancisco',
      location: null,
    },
    // statue with laurel wreath
    {
      id: 'photo-1772230398112-0419b5f6ca57',
      photographer: 'Everson Vansoski',
      username: 'eversonvansoski',
      location: 'Belo Horizonte, MG, Brasil',
    },
    // Socrates, Athens
    {
      id: 'photo-1776719316358-f3b246e88f3d',
      photographer: 'Vidar Nordli-Mathisen',
      username: 'vidarnm',
      location: null,
    },
    // Plato with Athena
    {
      id: 'photo-1776719315528-b793722cac9d',
      photographer: 'Vidar Nordli-Mathisen',
      username: 'vidarnm',
      location: null,
    },
    // Plato statue by column
    {
      id: 'photo-1787753774415-bfa2537f43ff',
      photographer: 'Alberto Domingo Carreiro',
      username: 'betitop',
      location: 'Athens, Grecia',
    },
    // Admont Abbey library
    {
      id: 'photo-1562932831-afcfe48b5786',
      photographer: 'Valdemaras D.',
      username: 'deko_photo4',
      location: null,
    },
    // ornate library
    {
      id: 'photo-1759732419233-5b84c4cb5a9c',
      photographer: 'Michael D Beckwith',
      username: 'mdbeckwith',
      location: 'The John Rylands Library, Manchester, UK',
    },
    // ancient city ruins
    {
      id: 'photo-1717518215340-0d1184c493fa',
      photographer: 'Alexis Presa',
      username: 'alexispresa',
      location: 'Corinth, Greece',
    },
    // columns at sunset
    {
      id: 'photo-1776717591137-f48addb6ce25',
      photographer: 'Burak Oskay',
      username: 'burakoskay',
      location: 'Pergamon Ancient City, Ulucami, Akropol Caddesi, Bergama/İzmir, Türkiye',
    },
    // Greek temple ruins
    {
      id: 'photo-1773017825019-b8d05f7eac4b',
      photographer: 'Daniel B Ramos',
      username: 'the_urbannographer',
      location: 'Archaeological Museum of Ancient Corinth, Argous, Archaia Korinthos, Greece',
    },
    // Greek temple columns
    {
      id: 'photo-1758559616527-35f149122a12',
      photographer: 'Wanderlust in Frame',
      username: 'kkincade',
      location: 'Temple of Hephaestus, Athens, Greece',
    },
    // ruins under blue sky
    {
      id: 'photo-1783279675068-5f555458d890',
      photographer: 'Melih Özmen',
      username: 'sargonsama',
      location: null,
    },
    // Roman temple ruins
    {
      id: 'photo-1762086092259-329c64c3cb17',
      photographer: 'JP Sheard',
      username: 'jpsheard',
      location: 'Roman Forum, Rome, Metropolitan City of Rome Capital, Italy',
    },
    // ancient Rome ruins
    {
      id: 'photo-1649754242327-2d7a73668fb5',
      photographer: 'Embla Munk Rynkebjerg',
      username: 'emblarynke',
      location: 'Rome, Italy',
    },
  ],
  japan: [
    // neon Japanese side street
    {
      id: 'photo-1493515322954-4fa727e97985',
      photographer: 'Andre Benz',
      username: 'trapnation',
      location: 'Tokyo, Japan',
    },
    // empty street at night
    {
      id: 'photo-1519638399535-1b036603ac77',
      photographer: 'Ian Valerio',
      username: 'iangvalerio',
      location: 'Japan',
    },
    // lantern-lit alley
    {
      id: 'photo-1617870314635-fc819547ec11',
      photographer: 'Pema G. Lama',
      username: 'peemaglama',
      location: 'Omoide Yokochō, 1 Chome-2 Nishishinjuku, Shinjuku City, Tokyo, Japan',
    },
    // pink cloud over street light
    {
      id: 'photo-1712087860928-c38c61a4e069',
      photographer: 'Faheem Ahmed',
      username: 'faheem_2911',
      location: null,
    },
    // street light, pink sky
    {
      id: 'photo-1712087857426-62e5c2a80f8e',
      photographer: 'Faheem Ahmed',
      username: 'faheem_2911',
      location: null,
    },
    // Tokyo Tower at dusk
    {
      id: 'photo-1513407030348-c983a97b98d8',
      photographer: 'Louie Martinez',
      username: 'thetalkinglens',
      location: '4 Chome-2-8 Shibakōen, Minato-ku, Japan',
    },
    // Tokyo at night from above
    {
      id: 'photo-1604928141064-207cea6f571f',
      photographer: 'Takashi Miyazaki',
      username: 'miyatankun',
      location: 'Roppongi, Minato City, Tokyo, Japan',
    },
    // city lights at night
    {
      id: 'photo-1669629229839-325cce20fab1',
      photographer: 'Leo Okuyama',
      username: 'okuyama_leo',
      location: 'Ebisu, Shibuya City, Tokyo, Japan',
    },
    // cherry blossoms over canal
    {
      id: 'photo-1598957232485-fab51e0ed7e8',
      photographer: 'Crystal Kay',
      username: 'xtalkay',
      location: 'Tokyo, Japan',
    },
    // cherry blossom canal
    {
      id: 'photo-1524413840807-0c3cb6fa808d',
      photographer: 'Sora Sagano',
      username: 'sorasagano',
      location: 'Meguro River, Matsuno, Japan',
    },
    // cherry trees by a river
    {
      id: 'photo-1585442581492-a4f38c1cfc14',
      photographer: 'Yusheng Deng',
      username: 'akiradeng',
      location: 'Kanuma, Tochigi, Japan',
    },
    // cherry blossoms and Mount Fuji
    {
      id: 'photo-1525635569544-610f9540664a',
      photographer: 'Daniel Hehn',
      username: 'katzenbus',
      location: 'Lake Kawaguchi, Fujikawaguchiko, Japan',
    },
    // cherry trees beside water
    {
      id: 'photo-1526344966-89049886b28d',
      photographer: 'Mark Tegethoff',
      username: 'tegethoff',
      location: null,
    },
    // torii on calm water
    {
      id: 'photo-1639056496887-3caaa605609b',
      photographer: 'Wu Hsien Yu',
      username: 'heyywh',
      location: null,
    },
    // torii at sunset
    {
      id: 'photo-1762018920776-67af60705fee',
      photographer: 'Fabio Montello',
      username: 'fabiomontello',
      location:
        'Itsukushima Shrine, 1-1 Miyajima-chō, Hatsukaichi, Prefettura di Hiroshima, Giappone',
    },
    // red torii on Lake Ashi
    {
      id: 'photo-1492571350019-22de08371fd3',
      photographer: 'Tianshu Liu',
      username: 'tianshu',
      location: '箱根神社 平和の鳥居, 箱根町, Japan',
    },
    // torii in the sea
    {
      id: 'photo-1708009254530-2b3c1ee00cfe',
      photographer: 'Lucius Hunter',
      username: 'lucius_x14',
      location: null,
    },
    // Itsukushima torii
    {
      id: 'photo-1504109586057-7a2ae83d1338',
      photographer: 'Nicki Eliza Schinow',
      username: 'nicki_schinow',
      location: 'Itsukushima Shrine, Hatsukaichi-shi, Japan',
    },
    // torii on a rocky outcrop
    {
      id: 'photo-1651910853503-b77731a6e718',
      photographer: 'Masaaki Komori',
      username: 'gaspanik',
      location: null,
    },
    // red torii tunnel
    {
      id: 'photo-1640068678791-e1ddf8806905',
      photographer: 'Matt Ketchum',
      username: 'mkultraman',
      location: 'Miyakami, Yugawara, Ashigarashimo District, Kanagawa 259-0314, Japan',
    },
  ],
  space: [
    // galaxy over the night sky
    {
      id: 'photo-1464802686167-b939a6910659',
      photographer: 'Jeremy Thomas',
      username: 'jeremythomasphoto',
      location: 'Edwards, United States',
    },
    // Earth and clouds from orbit
    {
      id: 'photo-1777047023742-1607aeb1a5bb',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // Milky Way
    {
      id: 'photo-1566345984367-fa2ba5cedc17',
      photographer: 'Aperture Vintage',
      username: 'aperturevintage',
      location: null,
    },
    // ocean clouds from orbit
    {
      id: 'photo-1446776811953-b23d57bd21aa',
      photographer: 'NASA',
      username: 'nasa',
      location: 'Space',
    },
    // North America and Pelican nebulae
    {
      id: 'photo-1610296669228-602fa827fc1f',
      photographer: 'Aldebaran S',
      username: 'aldebarans',
      location: 'Newton, MA',
    },
    // Earth at night
    {
      id: 'photo-1777047023536-8e47688b77f9',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // city lights from orbit
    {
      id: 'photo-1451187580459-43490279c0fa',
      photographer: 'NASA',
      username: 'nasa',
      location: 'Gulf of Mexico, United States',
    },
    // sea of stars
    {
      id: 'photo-1506318137071-a8e063b4bec0',
      photographer: 'Jeremy Perkins',
      username: 'jeremyperkins',
      location: null,
    },
    // crescent Earth
    {
      id: 'photo-1777047023579-5007a6d402bc',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // Earthset over the Moon
    {
      id: 'photo-1777033356671-59469ab29684',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // Milky Way over mountains
    {
      id: 'photo-1548625361-58a9b86aa83b',
      photographer: 'Cosmic Timetraveler',
      username: 'cosmictimetraveler',
      location: null,
    },
    // Space Shuttle above Earth
    {
      id: 'photo-1614121181207-4b6c334d353d',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // total solar eclipse
    {
      id: 'photo-1504192010706-dd7f569ee2be',
      photographer: 'Tyler van der Hoeven',
      username: 'tyvdh',
      location: null,
    },
    // blue starry night
    {
      id: 'photo-1470813740244-df37b8c1edcb',
      photographer: 'Mark Basarab',
      username: 'markbasarabvisuals',
      location: null,
    },
    // Milky Way over the coast
    {
      id: 'photo-1502134249126-9f3755a50d78',
      photographer: 'Shot by Cerqueira',
      username: 'shotbycerqueira',
      location: 'Armação dos Búzios, Brazil',
    },
    // Earth from the Shuttle
    {
      id: 'photo-1446776877081-d282a0f896e2',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // Andromeda Galaxy
    {
      id: 'photo-1543722530-d2c3201371e7',
      photographer: 'Guillermo Ferla',
      username: 'gferla',
      location: null,
    },
    // Rosette Nebula
    {
      id: 'photo-1778336110797-0deff0dd4b39',
      photographer: 'Steve Busch',
      username: 'sdbusch77',
      location: null,
    },
    // red nebula
    {
      id: 'photo-1772672869101-7abc3637fb7e',
      photographer: 'Scott Lord',
      username: 'darkcatimages',
      location: null,
    },
    // colorful nebula
    {
      id: 'photo-1771095436222-e20a8737fcd1',
      photographer: 'Sheng Hu',
      username: 'laohu911',
      location: null,
    },
    // nebula
    {
      id: 'photo-1462332420958-a05d1e002413',
      photographer: 'NASA',
      username: 'nasa',
      location: null,
    },
    // Milky Way, Rocky Mountains
    {
      id: 'photo-1465101162946-4377e57745c3',
      photographer: 'Jeremy Thomas',
      username: 'jeremythomasphoto',
      location: 'Rocky Mountain National Park, United States',
    },
    // Milky Way over Lake Tekapo
    {
      id: 'photo-1538370965046-79c0d6907d47',
      photographer: 'Graham Holtshausen',
      username: 'freedomstudios',
      location: 'Lake Tekapo, New Zealand',
    },
    // Westerlund 2 star cluster
    {
      id: 'photo-1706800696671-570820e7ff39',
      photographer: 'NASA Hubble Space Telescope',
      username: 'hubblespacetelescope',
      location: null,
    },
  ],
};
