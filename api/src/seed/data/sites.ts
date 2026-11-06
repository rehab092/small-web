/**
 * Seed sites: ten one-page sites with real prose, distinct themes, and links
 * between them. Three links point at addresses that never existed
 * (lost-lighthouse.zz, the-deep-archive.zz, old-wells.zz) and one at a real
 * web address (shown, never followed).
 */
export interface SeedSite {
  address: string;
  title: string;
  authorId: string;
  /** Minutes after SEED_BASE_TIME that the site was "published". */
  publishedMinutes: number;
  html: string;
}

/** Fixed clock for everything the seed writes. */
export const SEED_BASE_TIME = new Date('2026-11-02T08:00:00.000Z');

const page = (css: string, body: string): string => `<style>${css}</style>\n${body}`;

const SEA = 'body{font-family:Georgia,serif;background:#eef6f6;color:#12343b;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.6}h1{color:#0b5563}a{color:#0b6f80}';
const PAPER = 'body{font-family:Georgia,serif;background:#faf4e6;color:#3b2f1a;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.65}h1,h2{font-variant:small-caps}a{color:#8a4b0f}';
const NIGHT = 'body{font-family:system-ui,sans-serif;background:#14161f;color:#d9dcec;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.6}h1{color:#9fb4ff}a{color:#ffcf8a}';
const WARM = 'body{font-family:system-ui,sans-serif;background:#fff3e3;color:#4a2a12;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.6}h1{color:#b3470e}a{color:#b3470e}';
const GREEN = 'body{font-family:system-ui,sans-serif;background:#f1f7ec;color:#233a1c;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.6}h1{color:#2f6b1f}a{color:#2f6b1f}';

export const SEED_SITES: SeedSite[] = [
  {
    address: 'tidepool.zz',
    title: 'Tidepool: a field guide to the rock pools',
    authorId: 'ines-varga',
    publishedMinutes: 0,
    html: page(SEA, `
<h1>Tidepool</h1>
<p>Twice a day the sea withdraws from the rocky shore and leaves behind a scatter of small, bright worlds. A tidepool is a bowl of seawater trapped in the stone, and for a few hours it is a self-contained country with its own weather, its own predators and its own very patient inhabitants.</p>
<h2>Reading the tide</h2>
<p>The best pools are uncovered at low tide, and the lowest tides arrive around the new and full moon. I plan every visit from a tide table, and I borrow my favourite ones from the <a href="cartographers.zz">cartographers</a>, who print them in the margins of their hand-inked charts. Arrive an hour before the lowest water and leave when the tide turns; it comes back faster than you expect.</p>
<h2>Who lives here</h2>
<ul>
<li><strong>Beadlet anemones</strong> pull their tentacles in when the water drains, and look like glossy red jelly sweets.</li>
<li><strong>Hermit crabs</strong> trade shells as they outgrow them, sometimes in a queue.</li>
<li><strong>Limpets</strong> wander off to graze at high tide and return to exactly the same scar in the rock.</li>
<li><strong>Periwinkles</strong>, <strong>blennies</strong> and the odd shy starfish fill in the rest.</li>
</ul>
<h2>One rule</h2>
<p>Put every stone back the way you found it. The animals underneath have chosen that dark, wet side for a reason. If you are out after dark you will meet the shore's night shift too; the <a href="mothledger.zz">moth ledger</a> keeps a count of who comes to the lantern. For salt you can actually taste, follow the <a href="saltroad.zz">salt road</a> inland.</p>
<p><small>I used to keep the keeper's log from the old lighthouse here, but <a href="lost-lighthouse.zz">the lighthouse page</a> has gone.</small></p>`),
  },
  {
    address: 'cartographers.zz',
    title: "The Cartographers' Corner: hand-inked maps",
    authorId: 'tomas-reyes',
    publishedMinutes: 6,
    html: page(PAPER, `
<h1>The Cartographers' Corner</h1>
<p>We make maps the slow way: a dip pen, a pot of iron-gall ink and a sheet of heavy paper pinned flat to the table. A good map is an argument about what matters, and the argument is won or lost in what you decide to leave out.</p>
<h2>Why we still draw coastlines by hand</h2>
<p>Coasts are not lines. They are negotiations between rock and water that are renegotiated twice a day. When we ink a harbour chart we mark the high-water line, the low-water line and everything that lives between them, and in the margin we print the tide tables for the season, with the height of each high and low tide for every day. Sailors have trusted those little columns of numbers for four hundred years. Naturalists use them too; the writer of <a href="tidepool.zz">Tidepool</a> never leaves home without ours.</p>
<h2>Ink, paper, patience</h2>
<p>Iron-gall ink starts pale grey and darkens over a day as it oxidises. Rule your borders first, letter second and coastlines last, because the coastline is the part you are most likely to ruin. Every map takes between nine and forty hours, and we do not apologise for the number.</p>
<h2>Keep wandering</h2>
<p>Time is the other thing a map hides. Our neighbours at the <a href="slowclock.zz">slow clock</a> will happily explain why. And if you need to see the city from above, <a href="highline.zz">the high line</a> has the rooftops mapped better than we do.</p>`),
  },
  {
    address: 'slowclock.zz',
    title: 'The Slow Clock: watch repair and patience',
    authorId: 'tomas-reyes',
    publishedMinutes: 11,
    html: page(PAPER, `
<h1>The Slow Clock</h1>
<p>A mechanical watch is a spring that wants to unwind, held back by a tiny wheel that swings back and forth five or six times a second. Everything else in the case exists to count those swings and to make sure the spring does not forget to give the wheel a push at the right moment.</p>
<h2>What goes wrong</h2>
<p>Almost every watch that arrives on my bench has the same disease: old oil. Lubricants dry into varnish, the varnish grips the pivots, and the watch loses a minute an hour and then stops. The cure is a full strip, an ultrasonic bath, fresh synthetic oil applied in drops smaller than a grain of salt, and several days of listening to the beat on a timing machine.</p>
<h2>Bench notes</h2>
<ol>
<li>Photograph the movement before you touch it.</li>
<li>Release the mainspring before anything else. Always.</li>
<li>Keep screws in labelled trays; a lost screw means a lost evening.</li>
<li>Let the watch run for a week before you give it back.</li>
</ol>
<p>When a movement needs a replacement part nobody makes any more, I take it to the electronics bench at <a href="quietcircuits.zz">Quiet Circuits</a>, where the lathe and the patience are better than mine. Railway people used to set their pocket watches by the night trains; <a href="nightfreight.zz">Night Freight</a> still does. My ledger of vanished makers, <a href="the-deep-archive.zz">the deep archive</a>, is not online yet.</p>`),
  },
  {
    address: 'quietcircuits.zz',
    title: 'Quiet Circuits: bringing old radios back',
    authorId: 'wen-zhao',
    publishedMinutes: 17,
    html: page(NIGHT, `
<h1>Quiet Circuits</h1>
<p>Valve radios from the nineteen-fifties do not break the way phones do. They fade. A capacitor leaks, a resistor drifts, and one evening the voice on the speaker is a little thinner than it was. This page is my notebook for bringing them back.</p>
<h2>The first rule</h2>
<p>Never plug in a radio that has been in a shed. The old wax-paper capacitors absorb moisture and fail short, and a failed capacitor in a power supply will take the transformer with it. Replace them all, then bring the set up slowly on a variable transformer while watching the current.</p>
<h2>Alignment</h2>
<p>A radio that is repaired but not aligned is like a piano that is repaired but not tuned. With a signal generator and a patient ear you adjust each tuned circuit until the loudest point on the dial matches the station printed on the dial. It takes an evening and it is deeply satisfying.</p>
<h2>Listening</h2>
<p>The best reward is the sound. A warm valve set on a quiet night picks up stations that have no business reaching you: distant ports, shipping forecasts and, if you are lucky, the dispatchers of the <a href="nightfreight.zz">night freight</a> railway talking trains through the dark. Soldering is hungry work, and my favourite recipes for a long weekend at the bench are collected at <a href="pepperandrain.zz">Pepper and Rain</a>.</p>`),
  },
  {
    address: 'nightfreight.zz',
    title: 'Night Freight: timetables of the slow trains',
    authorId: 'wen-zhao',
    publishedMinutes: 23,
    html: page(NIGHT, `
<h1>Night Freight</h1>
<p>Passenger trains belong to the day. After the last commuter service has gone home, the railway belongs to the freight: grain and coal and containers, nine hundred metres at a time, rolling through towns that are asleep.</p>
<h2>How the timetable works</h2>
<p>A freight path is a reservation. The dispatcher books a slot on the line, and if the train is late the slot is gone, so it waits in a loop for the next gap. This is why you will sometimes see a freight train stopped for forty minutes in the middle of nowhere with its lights on. It is not broken; it is queuing.</p>
<h2>A sample night</h2>
<table>
<tr><th>Train</th><th>Cargo</th><th>Departs</th></tr>
<tr><td>4M12</td><td>Bread flour, to the mills</td><td>21:40</td></tr>
<tr><td>6A03</td><td>Rock salt, to the depot</td><td>23:15</td></tr>
<tr><td>7K88</td><td>Empty containers, returning</td><td>01:05</td></tr>
</table>
<p>The flour train feeds the bakers at <a href="ironbread.zz">Iron Bread</a>, who start their ovens at four. The salt train follows the old route of the <a href="saltroad.zz">salt road</a>. If you want to hear the dispatchers yourself, a restored valve radio of the kind documented at <a href="quietcircuits.zz">Quiet Circuits</a> does the job.</p>`),
  },
  {
    address: 'ironbread.zz',
    title: 'Iron Bread: sourdough from a cast-iron pot',
    authorId: 'tomas-reyes',
    publishedMinutes: 29,
    html: page(WARM, `
<h1>Iron Bread</h1>
<p>Good bread needs three things: flour, water and salt, and then time. Everything else is technique, and most technique is about managing the wild yeast and bacteria in a sourdough starter that has been alive longer than some of its owners.</p>
<h2>The loaf</h2>
<p>Mix five hundred grams of strong flour with three hundred and fifty of water and rest it for an hour. Add a hundred grams of active starter and ten of salt, fold the dough every half hour for three hours, then shape it and let it prove overnight in the fridge. The slow, cold fermentation is where the flavour comes from.</p>
<h2>The pot</h2>
<p>I bake in a cast-iron pot with the lid on for the first half of the bake. The pot traps the steam that rises from the dough, which keeps the crust soft long enough for the loaf to spring in the oven. Take the lid off, turn the heat down, and wait for the crust to turn the colour of strong tea.</p>
<p>My flour comes in on the early <a href="nightfreight.zz">night freight</a>. The salt for the dough comes from further away, along the old <a href="saltroad.zz">salt road</a>. On Sundays I make a flatbread with the spice mixes from <a href="pepperandrain.zz">Pepper and Rain</a>, and the whole kitchen smells for a week.</p>`),
  },
  {
    address: 'pepperandrain.zz',
    title: 'Pepper and Rain: cooking through the monsoon',
    authorId: 'odile-mercier',
    publishedMinutes: 35,
    html: page(WARM, `
<h1>Pepper and Rain</h1>
<p>When the monsoon arrives the whole kitchen changes. The markets thin out, the vegetables are the ones that like the wet, and everyone wants something hot, sour and a little bit fierce to eat while the rain hammers on the roof.</p>
<h2>The pantry</h2>
<p>Black pepper, mustard seed, tamarind, curry leaves and a jar of dried red chillies are the five things I never run out of. Toast whole spices in a dry pan until the first one pops, grind them coarse, and bloom them in hot oil before anything else goes in.</p>
<h2>Rasam for a wet afternoon</h2>
<p>Simmer tamarind water with tomato, crushed pepper and cumin. Finish with a tempering of mustard seed and curry leaves sizzled in ghee, and pour it over rice. It cures colds, hangovers and a bad mood in about equal measure.</p>
<h2>Sourcing</h2>
<p>My best pepper arrived on the back of a long journey. If you want to know how spices travelled before the aeroplane, read the <a href="saltroad.zz">salt road</a> page; it is the same story with a different cargo. When the sky clears I go up to the garden at <a href="highline.zz">the high line</a>, where there is a chilli plant that has outlived three landlords. And on Sundays, bread: see <a href="ironbread.zz">Iron Bread</a>.</p>`),
  },
  {
    address: 'highline.zz',
    title: 'The High Line: gardening on city rooftops',
    authorId: 'ines-varga',
    publishedMinutes: 41,
    html: page(GREEN, `
<h1>The High Line</h1>
<p>There is a surprising amount of unused land in any city, and almost all of it is flat, sunny and fifteen metres off the ground. A roof garden turns that wasted space into somewhere to sit, something to eat and a place for insects to land.</p>
<h2>What grows up there</h2>
<p>Wind and sun are your two enemies. Choose tough herbs (thyme, rosemary, oregano), succulents, and anything with silver leaves. Containers should be deep and heavy, because a light pot is a sail. Water in the early morning and mulch everything with gravel.</p>
<h2>Weight and water</h2>
<p>Before you bring up a single bag of soil, find out what the roof can carry. Saturated soil weighs about as much as concrete, and a sealed roof will thank you for a drainage layer under every bed. A rain barrel on the downpipe supplies most of the summer's water for free.</p>
<h2>Who visits</h2>
<p>Within a season the garden attracts bees, hoverflies and, on warm nights, moths drawn by the pale flowers; I send what I find to the <a href="mothledger.zz">moth ledger</a>. Chilli plants do well here and I trade seedlings with <a href="pepperandrain.zz">Pepper and Rain</a>. The best view of the roofs, though, is the one on the <a href="cartographers.zz">cartographers' map</a> of the district.</p>
<p>Further reading on green roofs lives <a href="http://example.org/green-roofs">out on the old web</a>, which this browser can show you but will not follow.</p>`),
  },
  {
    address: 'mothledger.zz',
    title: 'The Moth Ledger: a count of the night shift',
    authorId: 'ines-varga',
    publishedMinutes: 47,
    html: page(NIGHT, `
<h1>The Moth Ledger</h1>
<p>Every warm night I hang a white sheet in the garden, switch on a lamp and write down what arrives. This ledger is the result: eleven summers of small brown and silver animals, counted by hand.</p>
<h2>Why count moths?</h2>
<p>Moths are the quiet majority of the night. There are about ten times as many moth species as butterflies, they pollinate flowers that close in daylight, and almost every nesting bird feeds them to its chicks. When moths decline, the rest of the food web feels it.</p>
<h2>A good night</h2>
<p>The best counts come on warm, cloudy, windless nights just before rain. On the shore, a low tide in the dark brings a particular crowd: I have counted the rosy rustic and the sand dart only within sight of the water. That habit of mine is how I came to write about the pools in <a href="tidepool.zz">Tidepool</a> in the first place.</p>
<h2>Method</h2>
<ol>
<li>Sheet up at dusk, lamp on.</li>
<li>Count and photograph every twenty minutes until midnight.</li>
<li>Release everything at dawn, away from the lamp.</li>
</ol>
<p>The freight trains that pass behind the allotments sometimes shake the sheet; I note those nights as well. See the timetable at <a href="nightfreight.zz">Night Freight</a> if you want to know which.</p>`),
  },
  {
    address: 'saltroad.zz',
    title: 'The Salt Road: how salt crossed the country',
    authorId: 'ines-varga',
    publishedMinutes: 53,
    html: page(PAPER, `
<h1>The Salt Road</h1>
<p>Before refrigeration, salt was the thing that made a winter survivable. It preserved meat and fish, cured hides and seasoned everything, and in many places it was worth enough to be used as money. A word for wages in several languages still comes from it.</p>
<h2>From the sea</h2>
<p>The oldest salt came from the coast. Seawater was let into shallow clay pans at spring tide, closed off, and left to the sun and wind; the tides decided the harvest. Tide and weather were so central to the work that the pan-masters kept their own tide tables, handed down from father to daughter.</p>
<h2>Across the land</h2>
<p>From the pans the salt travelled inland in sacks on packhorses, along routes that are still marked by place names ending in <em>wich</em> and <em>salt</em>. Where the road met a river, a market grew; where it crossed a hill, an inn. Later the canals and then the freight railways took over the same cargo and the same paths, as <a href="nightfreight.zz">Night Freight</a> shows with its rock-salt train.</p>
<h2>Today</h2>
<p>Every loaf from <a href="ironbread.zz">Iron Bread</a> contains a little of this history. For the shore where it began, read <a href="tidepool.zz">Tidepool</a>. The old wells that once supplied the inland brine pans are described at <a href="old-wells.zz">the old wells</a>, a page I have never been able to find.</p>`),
  },
];
