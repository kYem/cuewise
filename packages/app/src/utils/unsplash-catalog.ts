import type { FocusImageCategory } from '@cuewise/shared';

/**
 * One curated background photo. Colocating the credit with the id means an entry
 * can't drift from its attribution; new metadata (location, alt text, placeholder
 * color) lands here as additive fields.
 *
 * Every entry was verified against its live unsplash.com photo page (og:image id
 * match) and its CDN URL confirmed reachable at the time it was added.
 */
export interface CuratedPhoto {
  id: string;
  /** Null when unverified — a wrong name is worse than none. */
  photographer: string | null;
  username: string | null;
}
export const CURATED_PHOTOS: Record<FocusImageCategory, CuratedPhoto[]> = {
  nature: [
    // Mountain lake sunrise
    {
      id: 'photo-1469474968028-56623f02e42e',
      photographer: 'Urban Vintage',
      username: 'urban_vintage',
    },
    // Forest valley
    { id: 'photo-1426604966848-d7adac402bff', photographer: 'Adam Kool', username: 'adamkool' },
    // Foggy mountains
    { id: 'photo-1470071459604-3b5ec3a7fe05', photographer: 'v2osk', username: 'v2osk' },
    // Green hills
    {
      id: 'photo-1472214103451-9374bd1c798e',
      photographer: 'Robert Lukeman',
      username: 'robertlukeman',
    },
    // Waterfall
    {
      id: 'photo-1433086966358-54859d0ed716',
      photographer: 'Blake Verdoorn',
      username: 'blakeverdoorn',
    },
    // Aerial forest
    { id: 'photo-1501854140801-50d01698950b', photographer: 'Qingbao Meng', username: 'ideasboom' },
    // Sunlit forest
    {
      id: 'photo-1441974231531-c6227db76b6e',
      photographer: 'Lukasz Szmigiel',
      username: 'szmigieldesign',
    },
    // Mountain reflection
    { id: 'photo-1475924156734-496f6cac6ec1', photographer: 'Quino Al', username: 'quinoal' },
    // Valley vista
    { id: 'photo-1465056836041-7f43ac27dcb5', photographer: 'Tobias Keller', username: 'tokeller' },
    // misty mountain valley
    {
      id: 'photo-1759061003114-337938a8a004',
      photographer: 'Tobias Pfeifer',
      username: 'tobi_sap',
    },
    // lush green valley
    {
      id: 'photo-1754637024977-368665e88caf',
      photographer: 'Paolo Boaretto',
      username: 'paolo1971',
    },
    // pastel sunrise peaks
    {
      id: 'photo-1772733694354-3b4a33568ef4',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
    },
    // rolling green hills
    {
      id: 'photo-1759759260780-f09be8608b53',
      photographer: 'paws and prints',
      username: 'paws_and_prints',
    },
    // grassy sunlit hills
    {
      id: 'photo-1749350902665-efefbfc84fd4',
      photographer: 'Fadhil Abhimantra',
      username: 'fabhimantra',
    },
    // mountain lake sunrise
    {
      id: 'photo-1755643842005-460e3a030102',
      photographer: 'Emma Swoboda',
      username: 'emmakphoto',
    },
    // calm tarn reflection
    { id: 'photo-1759434190960-87511b2a5e5c', photographer: 'Jonny Gios', username: 'supergios' },
    // mountain mirror lake
    { id: 'photo-1750779940369-2b817adea9d7', photographer: 'Colin Watts', username: 'colinwatts' },
    // silky woodland waterfall
    {
      id: 'photo-1736616645685-a88b3ecda98c',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
    },
    // peaceful lake waterfall
    {
      id: 'photo-1432405972618-c60b0225b8f9',
      photographer: 'Jeffrey Workman',
      username: 'jeffreyp',
    },
  ],
  forest: [
    // Forest path
    {
      id: 'photo-1448375240586-882707db888b',
      photographer: 'Sebastian Unrau',
      username: 'sebastian_unrau',
    },
    // Green forest
    {
      id: 'photo-1542273917363-3b1817f69a2d',
      photographer: 'Marita Kavelashvili',
      username: 'maritaextrabold',
    },
    // Misty forest
    { id: 'photo-1511497584788-876760111969', photographer: 'Sergei A', username: 'sakulich' },
    // Redwood trees
    { id: 'photo-1440342359743-84fcb8c21f21', photographer: 'kazuend', username: 'kazuend' },
    // Autumn forest
    { id: 'photo-1473448912268-2022ce9509d8', photographer: 'Luca Bravo', username: 'lucabravo' },
    // Sunbeams through trees
    {
      id: 'photo-1502082553048-f009c37129b9',
      photographer: 'niko photos',
      username: 'niko_photos',
    },
    // Forest stream
    { id: 'photo-1476231682828-37e571bc172f', photographer: 'Geranimo', username: 'geraninmo' },
    // Dense woodland
    {
      id: 'photo-1425913397330-cf8af2ff40a1',
      photographer: 'Steven Kamenar',
      username: 'skamenar',
    },
    // Bamboo forest
    { id: 'photo-1503435824048-a799a3a84bf7', photographer: 'Filip Zrnzević', username: 'filipz' },
    // Foggy pine forest
    {
      id: 'photo-1523712999610-f77fbcfc3843',
      photographer: 'Johannes Plenio',
      username: 'jplenio',
    },
    // foggy evergreen forest
    {
      id: 'photo-1765871320521-7eb7c98a1061',
      photographer: 'Roberto Shumski',
      username: 'robshumski',
    },
    // dark misty pines
    { id: 'photo-1764111812995-b73ff58fc7d7', photographer: 'Dmitry Spravko', username: 'kaprion' },
    // sunlit pine trail
    { id: 'photo-1752230446597-a5b08f8647e4', photographer: 'Gavin Allanwood', username: 'fp4' },
    // misty forested slope
    {
      id: 'photo-1758642882005-447873fd2d29',
      photographer: 'Andrea Caramello',
      username: 'andreacaramello',
    },
    // winter forest sunbeams
    {
      id: 'photo-1769006352025-1a429e69398f',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
    },
    // fog shrouded evergreens
    {
      id: 'photo-1755398104848-2f8da6532e4d',
      photographer: 'Emma Swoboda',
      username: 'emmakphoto',
    },
    // misty sunlit path
    { id: 'photo-1760479099643-b37a52e7c094', photographer: 'Ingmar', username: 'visualsbying' },
    // misty pine path
    { id: 'photo-1762085337173-cca26f2265bf', photographer: 'Alex varela', username: 'alexvarelo' },
    // foggy forest trail
    {
      id: 'photo-1693967325401-b841b7c0dd83',
      photographer: 'Peter Robbins',
      username: 'prphotography262',
    },
    // ferny forest trail
    {
      id: 'photo-1685330187195-1bae2038f3c4',
      photographer: 'Peter Robbins',
      username: 'prphotography262',
    },
  ],
  ocean: [
    // Ocean waves
    { id: 'photo-1505142468610-359e7d316be0', photographer: 'Shifaaz Shamoon', username: 'sotti' },
    // Beach sunset
    { id: 'photo-1507525428034-b723cf961d3e', photographer: 'Sean Oulashin', username: 'oulashin' },
    // Calm sea
    {
      id: 'photo-1439405326854-014607f694d7',
      photographer: 'Joseph Barrientos',
      username: 'jbcreate_',
    },
    // Turquoise water
    { id: 'photo-1518837695005-2083093ee35b', photographer: 'Matt Hardy', username: 'matthardy' },
    // Ocean horizon
    {
      id: 'photo-1484291470158-b8f8d608850d',
      photographer: 'Christoffer Engström',
      username: 'christoffere',
    },
    // Tropical beach
    {
      id: 'photo-1519046904884-53103b34b206',
      photographer: 'Elizeu Dias',
      username: 'elishavision',
    },
    // Beach aerial
    {
      id: 'photo-1506929562872-bb421503ef21',
      photographer: 'Gaddafi Rusli',
      username: 'gaddafirusli',
    },
    // Coastal rocks
    { id: 'photo-1468413253725-0d5181091126', photographer: 'Rowan Heuvel', username: 'insolitus' },
    // Sea waves
    { id: 'photo-1494791368093-85217fbbf8de', photographer: 'Michael Dam', username: 'michaeldam' },
    // dunes meet ocean
    { id: 'photo-1744024400385-462f45c02633', photographer: 'Max Böhme', username: 'max_boehme' },
    // pastel beach calm
    { id: 'photo-1744783720264-a7c4d54b155c', photographer: 'Karl Moore', username: 'karl333' },
    // ocean sunset horizon
    { id: 'photo-1556117182-70eb78020e91', photographer: 'Crest Lee', username: 'crest712' },
    // calm sunset sea
    {
      id: 'photo-1772424131868-6b9f154b59ce',
      photographer: 'Marwan Abdalah',
      username: 'marwan_abdalah',
    },
    // turquoise wave aerial
    { id: 'photo-1744648617182-519c4bf39e30', photographer: 'Hameen Reynolds', username: 'hameen' },
    // sandy coastline aerial
    { id: 'photo-1774142532286-2ae46f0c3563', photographer: 'Iain', username: 'photoken123' },
    // waves washing shore
    {
      id: 'photo-1770110628704-86ba8c7b3b1c',
      photographer: 'Ahmed Saeed',
      username: 'anmadezzzzz',
    },
    // aerial beach waves
    {
      id: 'photo-1758213755328-c4b3912bf5cb',
      photographer: 'Kristaps Ungurs',
      username: 'kristapsungurs',
    },
    // turquoise cliff coast
    {
      id: 'photo-1753188354738-2850c4a7196b',
      photographer: 'Georgii Eletskikh',
      username: 'elegeo',
    },
    // turquoise sea stacks
    {
      id: 'photo-1759660022306-a78006fb8d0a',
      photographer: 'Raymond Petrik',
      username: 'raymondpetrik',
    },
  ],
  mountains: [
    // Mountain peak
    {
      id: 'photo-1464822759023-fed622ff2c3b',
      photographer: 'Kalen Emsley',
      username: 'kalenemsley',
    },
    // Snow mountains
    { id: 'photo-1506905925346-21bda4d32df4', photographer: 'Sam Ferrara', username: 'samferrara' },
    // Mountain range
    { id: 'photo-1454496522488-7a8e488e8606', photographer: 'Rohit Tandon', username: 'sepoys' },
    // Starry mountains
    {
      id: 'photo-1519681393784-d120267933ba',
      photographer: 'Benjamin Voros',
      username: 'vorosbenisop',
    },
    // Alpine lake
    {
      id: 'photo-1486870591958-9b9d0d1dda99',
      photographer: 'Jeremy Bishop',
      username: 'jeremybishop',
    },
    // Mountain mist
    {
      id: 'photo-1483728642387-6c3bdd6c93e5',
      photographer: 'Daniel Leone',
      username: 'danielleone',
    },
    // Rocky peaks
    { id: 'photo-1434394354979-a235cd36269d', photographer: 'Ales Krivec', username: 'aleskrivec' },
    // Mountain meadow
    {
      id: 'photo-1445363692815-ebcd599f7621',
      photographer: 'Cagatay Orhan',
      username: 'cagatayorhan',
    },
    // Swiss Alps
    { id: 'photo-1458668383970-8ddd3927deed', photographer: 'samsommer', username: 'samsommer' },
    // Misty mountains
    { id: 'photo-1477346611705-65d1883cee1e', photographer: 'John Towner', username: 'heytowner' },
    // alpine peaks dawn
    {
      id: 'photo-1780042426982-cb794203ea1d',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
    },
    // snowy dolomites twilight
    {
      id: 'photo-1769631417306-a1da09f42b20',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
    },
    // sunrise above fog
    {
      id: 'photo-1762181702079-40f2f9ac56e4',
      photographer: 'Pascal Debrunner',
      username: 'debrupas',
    },
    // golden snowcapped range
    { id: 'photo-1760340642096-fa5ccff5b8e4', photographer: 'Ryan Klaus', username: 'ryankphoto' },
    // foggy mountain ridges
    { id: 'photo-1759310386268-a5ee8a2f0cfa', photographer: 'Pichara', username: 'pichara' },
    // golden misty hills
    { id: 'photo-1758637689126-2598f5b17ceb', photographer: '志远 杨', username: 'yangzhiyuan' },
    // tuscan misty sunrise
    {
      id: 'photo-1744272614586-ebab1f125903',
      photographer: 'Studio Pizza',
      username: 'studiopizza',
    },
    // jagged golden peaks
    {
      id: 'photo-1762886457614-98d4dc98f6ef',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
    },
    // dolomites sunset glow
    {
      id: 'photo-1727976971228-ee2e309c90c1',
      photographer: 'Marek Piwnicki',
      username: 'marekpiwnicki',
    },
  ],
  minimal: [
    // Gradient purple
    { id: 'photo-1557682250-33bd709cbe85', photographer: 'Luke Chesser', username: 'lukechesser' },
    // Abstract waves
    {
      id: 'photo-1558591710-4b4a1ae0f04d',
      photographer: 'Jean-Philippe Delberghe',
      username: 'jipy32',
    },
    // Minimal gradient
    { id: 'photo-1557683316-973673baf926', photographer: 'Luke Chesser', username: 'lukechesser' },
    // Pink gradient
    {
      id: 'photo-1553356084-58ef4a67b2a7',
      photographer: 'Pawel Czerwinski',
      username: 'pawel_czerwinski',
    },
    // Blue gradient
    { id: 'photo-1557682224-5b8590cd9ec5', photographer: 'Luke Chesser', username: 'lukechesser' },
    // Colorful gradient
    {
      id: 'photo-1579546929518-9e396f3cc809',
      photographer: 'Codioful (Formerly Gradienta)',
      username: 'codioful',
    },
    // Soft gradient
    { id: 'photo-1557682260-96773eb01377', photographer: 'Luke Chesser', username: 'lukechesser' },
    // Geometric minimal
    {
      id: 'photo-1550684848-fac1c5b4e853',
      photographer: 'Rodion Kutsaiev',
      username: 'frostroomhead',
    },
    // Abstract blue
    { id: 'photo-1557683311-eac922347aa1', photographer: 'Luke Chesser', username: 'lukechesser' },
    // Soft pastel
    {
      id: 'photo-1528459801416-a9e53bbf4e17',
      photographer: 'Annie Spratt',
      username: 'anniespratt',
    },
    // blue white gradient
    {
      id: 'photo-1760865245520-21b0786f5236',
      photographer: 'Philipp Hubert',
      username: 'philipphubert',
    },
    // white wavy lines
    {
      id: 'photo-1741806914386-c60073a0fed3',
      photographer: 'Pawel Czerwinski',
      username: 'pawel_czerwinski',
    },
    // white sand dunes
    {
      id: 'photo-1765498067720-6ff6847f8f85',
      photographer: 'Royce Fonseca',
      username: 'casunshine0508',
    },
    // soft dune curves
    { id: 'photo-1698471058817-a280ddf07704', photographer: 'Zetong Li', username: 'zetong' },
    // dunes blue hour
    { id: 'photo-1741813203115-e4a83fc6e9d5', photographer: 'Joseph Corl', username: 'jcorl' },
    // serene sky gradient
    {
      id: 'photo-1650803321892-efba59b28a60',
      photographer: 'Chris Appano',
      username: 'chrisappano',
    },
    // purple green gradient
    {
      id: 'photo-1618397746666-63405ce5d015',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
    },
    // smooth purple render
    {
      id: 'photo-1618556450994-a6a128ef0d9d',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
    },
    // colorful mesh gradient
    {
      id: 'photo-1618005182384-a83a8bd57fbe',
      photographer: 'Milad Fakurian',
      username: 'fakurian',
    },
    // calm grey sea
    { id: 'photo-1760294750422-07572513d0de', photographer: 'Anna Hunko', username: 'annahunko' },
  ],
  dark: [
    // Night sky stars
    {
      id: 'photo-1419242902214-272b3f66ee7a',
      photographer: 'Vincentiu Solomon',
      username: 'vincentiu',
    },
    // Dark forest
    {
      id: 'photo-1507400492013-162706c8c05e',
      photographer: 'Timothée Duran',
      username: 'timotheeduran',
    },
    // Night cityscape
    {
      id: 'photo-1472552944129-b035e9ea3744',
      photographer: 'Gregoire Jeanneau',
      username: 'gregjeanneau',
    },
    // Milky way
    {
      id: 'photo-1536183922588-166604504d5e',
      photographer: 'Kyle Johnson',
      username: 'kylejeffreys',
    },
    // Night road
    { id: 'photo-1489549132488-d00b7eee80f1', photographer: 'Diego PH', username: 'jdiegoph' },
    // Starry night
    { id: 'photo-1475274047050-1d0c0975c63e', photographer: 'Paul Lichtblau', username: 'laup' },
    // Night forest
    {
      id: 'photo-1488866022504-f2584929ca5f',
      photographer: 'Nathan Anderson',
      username: 'nathananderson',
    },
    // milky way night
    {
      id: 'photo-1742626157111-59f3f1019a8a',
      photographer: 'Tobias Rademacher',
      username: 'tobbes_rd',
    },
    // starry beach night
    { id: 'photo-1561009706-c90773f936f3', photographer: 'SR', username: 'lemonmelon' },
    // stars over summit
    { id: 'photo-1510981023495-45fca86762e9', photographer: 'Phil Botha', username: 'philbotha' },
    // aurora coastal mountains
    {
      id: 'photo-1570470767483-286963cb60cf',
      photographer: 'Sami Matias Breilin',
      username: 'samimatias',
    },
    // aurora over forest
    {
      id: 'photo-1747633126452-dee49902fc6e',
      photographer: 'Zach Kessinger',
      username: 'wonderwallphotos',
    },
    // milky way mountains
    {
      id: 'photo-1593481118939-40dea95585ad',
      photographer: 'Joshua Woroniecki',
      username: 'joshuaworoniecki',
    },
    // meteor starry sky
    { id: 'photo-1599218419176-0daa21523249', photographer: 'Олег Мороз', username: 'tengyart' },
    // aurora snowy peaks
    { id: 'photo-1759675739458-6e5a4a60a117', photographer: 'Jonny Gios', username: 'supergios' },
    // dark dusk silhouettes
    { id: 'photo-1741501769971-68e9b813509a', photographer: 'MChe Lee', username: 'mclee' },
    // aurora light burst
    {
      id: 'photo-1749033133028-7fb64bd38e07',
      photographer: 'Federico Bottos',
      username: 'landscapeplaces',
    },
    // multihued aurora night
    { id: 'photo-1531366936337-7c912a4589a7', photographer: 'Lightscape', username: 'lightscape' },
  ],
};
