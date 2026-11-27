// Tests for the spelling-suggestion rule in src/polish.js: it must never question a
// correctly spelled word, and must offer a wrong word as rarely as it can.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWordLists, wordsToAsk, PAIRS } from '../src/polish.js';

const read = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
const lists = loadWordLists(read('known-words.txt'), read('common-words.txt'), read('extra-known.txt'));
const ask = (text) => wordsToAsk({ format: 1, id: 'b', title: '', pages: [{ text, stickers: [] }] }, lists, []);
// Ask about each word on its own (a book stops at 8 words).
const suggest = (word) => ask(word)[0]?.suggestion ?? null;

// Words a young writer spells right: plain words, endings and contractions. Zero may be asked.
const CORRECT = `
kissed kisses kissing tapped tapping taps hoping hoped hopes hopping hopped hops baked baking bakes
you've she'd he'd i'd we'd they'd you'd i've we've they've would've could've should've
you're we're they're i'm i'll you'll he'll she'll we'll they'll it'll that'll who'll
she's he's it's that's what's where's who's there's here's let's how's one's
isn't aren't wasn't weren't don't doesn't didn't won't wouldn't couldn't shouldn't can't haven't hasn't hadn't mustn't
ok okay um hmm yeah nope oops gonna wanna kinda gotta tv wifi
dog's cat's mom's dad's friend's teacher's mommy's grandma's
mommy daddy mom dad grandma grandpa grandmother grandfather sister brother baby babies family
friend friends friendly friendship neighbor neighbors teacher teachers student students classmate classmates
school schools classroom recess lunch homework library playground playgrounds
house houses home homes room rooms kitchen bedroom bathroom garden yard backyard window windows door doors
dragon dragons castle castles knight knights princess princesses prince king queen wizard wizards witch witches
fairy fairies giant giants monster monsters pirate pirates treasure treasures ghost ghosts robot robots alien aliens
dinosaur dinosaurs unicorn unicorns mermaid mermaids superhero superheroes
rocket rockets spaceship spaceships planet planets moon star stars sun galaxy universe astronaut astronauts
puppy puppies kitten kittens rabbit rabbits bunny bunnies hamster hamsters turtle turtles frog frogs tadpole tadpoles
elephant elephants giraffe giraffes monkey monkeys zebra zebras lion lions tiger tigers bear bears penguin penguins
dolphin dolphins whale whales shark sharks octopus octopuses butterfly butterflies caterpillar spider spiders
chicken chickens horse horses donkey donkeys duck ducks owl owls eagle eagles parrot parrots snake snakes lizard lizards
apple apples banana bananas orange oranges strawberry strawberries grapes watermelon cherries lemon lemons peach peaches
pizza pasta spaghetti sandwich sandwiches cookie cookies cupcake cupcakes pancakes waffles popcorn pretzel
chocolate candy cereal breakfast dinner supper snack snacks juice milk water cheese burger fries
ran running runs runner runners swam swimming swimmer jumped jumping jumps jumper walked walking walks walker
played playing plays player players played looked looking looks looker wanted wanting wants asked asking asks
helped helping helps helper helpful helpless loved loving loves lovely lover liked liking likes disliked
smiled smiling smiles smiley cried crying cries cried tried trying tries tries carried carrying carries
stopped stopping stops stopper dropped dropping drops dropper clapped clapping claps hugged hugging hugs
planned planning plans planner shopped shopping shops shopper hopped skipped skipping skips slipped slipping slips
chatted chatting chats batted batting bats grabbed grabbing grabs jogged jogging jogs
chased chasing chases raced racing races danced dancing dances dancer closed closing closes closer
used using uses user liked lived living lives loved moved moving moves named naming names
saved saving saves shared sharing shares smiled stared staring stares tasted tasting tastes
bigger biggest smaller smallest taller tallest shorter shortest faster fastest slower slowest
happier happiest funnier funniest sillier silliest prettier prettiest easier easiest busier busiest
nicer nicest bravest brave bravely happily slowly quickly quietly loudly gently softly sadly madly badly
carefully carefully kindly really finally suddenly usually lonely lovely friendly sleepy sleepily
bumped bumping bumps jumbled mumbled tumbled stumbled grumbled crumbled
waved waving waves waver baked baker bakers painted painting paints painter painters
cooked cooking cooks cooker singer singers singing sings sang sung
sleepless sleeping sleeps slept slept dreamed dreaming dreams dreamer
thinking thinks thought thoughts wished wishing wishes wished wanted
laughed laughing laughs laughter giggled giggling giggles screamed screaming screams
shouted shouting shouts whispered whispering whispers yelled yelling yells
builds building buildings builder built buying buys bought bringing brings brought
catching catches caught teaching teaches taught reaching reaches reached
watching watches watched washing washes washed brushing brushes brushed
boxes foxes wishes dishes bushes churches glasses kisses passes crosses
leaves leaf wolves wolf knives knife lives shelves shelf thieves loaves halves
mice teeth feet geese children women men people person
flowers flower trees tree forest forests jungle jungles mountain mountains river rivers ocean oceans lake lakes
beach beaches island islands desert deserts volcano volcanoes cave caves waterfall waterfalls
rainbow rainbows thunder lightning storm storms hurricane tornado snowman snowflake snowflakes
birthday birthdays party parties present presents balloon balloons candle candles
christmas halloween holiday holidays vacation vacations picnic picnics parade parades
yesterday today tomorrow tonight morning evening afternoon weekend weekends
because everything everyone everybody something someone somebody anything anyone anybody nothing nobody
always never sometimes often usually maybe perhaps already almost again together another other others
beautiful beautifully wonderful wonderfully terrible terribly horrible horribly amazing amazingly
excited exciting excitement scared scary frightened worried nervous happy happily angry angrily
different difficult important interesting favorite favorites special specially
which where when what who whose why how there their they're these those through thought though enough
would could should might must shall will can may
into onto upon within without inside outside around across between behind beside beyond
people animal animals pet pets zoo farm farmer farmers market store shop town city village country
computer computers tablet tablets phone phones camera cameras picture pictures video videos movie movies game games
book books story stories page pages chapter title author words word letter letters
paper pencil pencils crayon crayons marker markers scissors glue tape ruler eraser backpack
music song songs piano guitar drum drums band
bicycle bicycles bike bikes scooter skateboard helmet wheel wheels truck trucks tractor tractors
airplane airplanes helicopter helicopters boat boats ship ships train trains bus buses car cars
soccer baseball basketball football tennis swimming skating hockey gymnastics
winter summer spring autumn spring snowing raining sunny cloudy windy rainy
mountain valley hill hills meadow field fields path trail bridge bridges tunnel tunnels tower towers
kingdom kingdoms palace palaces dungeon dungeons magic magical wand wands spell spells potion potions
adventure adventures journey journeys quest mystery mysteries secret secrets surprise surprises
brother's sister's dragon's monster's rocket's children's people's
tummy tummies yummy yucky icky smelly stinky silly goofy wacky
swinging swings swung sliding slides slid climbing climbs climbed crawling crawls crawled
hiding hides hid hidden finding finds found losing loses lost winning wins won
falling falls fell fallen flying flies flew flown driving drives drove driven
riding rides rode ridden writing writes wrote written reading reads read
eating eats ate eaten drinking drinks drank drunk giving gives gave given
seeing sees saw seen going goes went gone coming comes came become becoming
taking takes took taken making makes made
`.split(/\s+/).filter(Boolean);

// Real slips as "what was typed=what was meant" ("a|b": either is right). Quiet is always allowed; a wrong offer never is.
const SLIPS = `
aple=apple sno=snow brane=brain|brave elefant=elephant drinkd=drank|drink|drinks cameing=coming|came nite=night
wen=when teh=the wus=was thay=they sed=said frum=from cum=come agen=again wich=which wat=what hav=have luv=love
gud=good wud=would cud=could shud=should woud=would coud=could rok=rock wont=won't dont=don't isnt=isn't
evry=every eny=any sory=sorry funy=funny hapy=happy pupy=puppy juse=juice enuf=enough piza=pizza bik=bike kno=know
nu=new wher=where tonite=tonight snak=snake brav=brave thier=their nigt=night sayd=said wuz=was agin=again
frend=friend freind=friend freinds=friends frends=friends skool=school scool=school becos=because becuz=because
becuse=because becaus=because becase=because beacuse=because becouse=because becasue=because wunce=once
runing=running swiming=swimming jumpt=jumped jumpd=jumped walkd=walked playd=played plaied=played lookd=looked
stopd=stopped tryed=tried cryed=cried dragun=dragon dragan=dragon dragen=dragon drgon=dragon castel=castle
casle=castle casul=castle rokit=rocket roket=rocket rocet=rocket puppie=puppy|puppies dinosor=dinosaur
dinasaur=dinosaur spaceshp=spaceship spacship=spaceship tresure=treasure treasur=treasure forrest=forest
forist=forest diamnd=diamond diamand=diamond pirat=pirate wizerd=wizard wizzard=wizard wizad=wizard
kingdum=kingdom kigdom=kingdom prinsess=princess pricess=princess whent=went mornig=morning moring=morning
tomorow=tomorrow tomarrow=tomorrow tommorow=tomorrow todai=today todae=today tooday=today yestarday=yesterday
yesturday=yesterday everone=everyone sumthing=something somthin=something somthing=something nuthing=nothing
nothin=nothing allways=always alwayz=always agian=again againe=again pleese=please plese=please
sorrey=sorry excitted=excited exited=excited scarey=scary scairy=scary happey=happy braev=brave gaint=giant
giaint=giant monstr=monster monstor=monster monstar=monster
wierd=weird recieve=receive definately=definitely interesing=interesting intresting=interesting
favorit=favorite favrite=favorite birthdy=birthday birthay=birthday brithday=birthday chocolat=chocolate
choclate=chocolate vegtable=vegetable banan=banana bananna=banana oringe=orange orang=orange strawbery=strawberry
strawberrys=strawberries cookys=cookies peeple=people peple=people peopel=people shoud=should beutiful=beautiful
beautifull=beautiful beautful=beautiful libary=library libery=library throgh=through thorugh=through
thougt=thought thoght=thought caugt=caught cought=caught rember=remember remeber=remember remmember=remember
diffrent=different diferent=different probaly=probably realy=really finaly=finally actualy=actually usualy=usually
suddnly=suddenly sudenly=suddenly quikly=quickly slowley=slowly carefuly=carefully hapily=happily lonley=lonely
lonly=lonely silley=silly famly=family famaly=family ocian=ocean mounten=mountain mountian=mountain
mountin=mountain jungel=jungle jungal=jungle rainbo=rainbow huricane=hurricane earthquak=earthquake planit=planet
planat=planet univers=universe astronot=astronaut astronaught=astronaut alein=alien robbot=robot robut=robot
computor=computer compter=computer camra=camera cammera=camera picter=picture pictur=picture writen=written
writting=writing beleive=believe peice=piece cieling=ceiling anuther=another mabye=maybe mayby=maybe
allready=already somtimes=sometimes everythng=everything anywere=anywhere somewere=somewhere everywere=everywhere
togther=together togethr=together toghether=together
dolfin=dolphin giraff=giraffe jiraffe=giraffe kangeroo=kangaroo monky=monkey donky=donkey tigar=tiger
lyon=lion zebbra=zebra pengwin=penguin pengiun=penguin turtel=turtle turtal=turtle buterfly=butterfly
butterfy=butterfly caterpiller=caterpillar spidar=spider snaik=snake hamstr=hamster rabit=rabbit
bunnie=bunny|bunnies kiten=kitten chiken=chicken spagetti=spaghetti sandwhich=sandwich sandwitch=sandwich
sanwich=sandwich cereel=cereal brekfast=breakfast brakfast=breakfast jucie=juice watermellon=watermelon
techer=teacher teachar=teacher homwork=homework socer=soccer basketbal=basketball basebal=baseball footbal=football
bikeing=biking makeing=making takeing=taking comeing=coming haveing=having writeing=writing hopeing=hoping
stoped=stopped hoped=hoped runnning=running
didnt=didn't couldnt=couldn't wouldnt=wouldn't shouldnt=shouldn't wasnt=wasn't werent=weren't thats=that's
youre=you're theyre=they're hasnt=hasn't havent=haven't doesnt=doesn't hadnt=hadn't arent=aren't
whats=what's wheres=where's heres=here's
tryd=tried flys=flies babys=babies berrys=berries storys=stories
loveing=loving smileing=smiling danceing=dancing livd=lived lovd=loved movd=moved
kitchan=kitchen kichen=kitchen bathrom=bathroom bedrom=bedroom windo=window
cloths=clothes clothe=clothes shose=shoes shoos=shoes sokcs=socks jaket=jacket
frog=frog
`.split(/\s+/).filter(Boolean).filter((entry) => entry.split('=')[0] !== entry.split('=')[1]).map((entry) => entry.split('='));

test('a list of 500+ correctly spelled words, with endings and contractions: none is ever asked about', () => {
  assert.ok(new Set(CORRECT).size >= 500, `only ${new Set(CORRECT).size} words`);
  const asked = [...new Set(CORRECT)].filter((word) => ask(word).length > 0);
  assert.deepEqual(asked, []);
  assert.deepEqual(ask([...new Set(CORRECT)].join(' ')), []);
});

test('regular endings and contractions of known words are known', () => {
  for (const word of ['kissed', 'tapped', 'hoping', "you've", "she'd", 'ok', 'hoped', 'babies', 'hurried', 'happier', 'quickly'])
    assert.deepEqual(ask(word), [], word);
});

test('no hand-checked short pair is a word the writer could have right, and each answer is a friendly word', () => {
  for (const [word, right] of Object.entries(PAIRS)) {
    assert.ok(word.length < 5 || !lists.commonSet.has(word), word);
    assert.ok(!lists.commonSet.has(word), word);
    assert.ok(lists.commonSet.has(right), right);
    assert.equal(suggest(word), right, word);
  }
});

test('words under 5 letters are asked about only from the hand-checked pairs', () => {
  for (const word of ['aple', 'sno', 'wnet', 'tiem', 'cak', 'frot', 'ruf', 'moom', 'siad', 'sund', 'cuts', 'hoom', 'zoon']) {
    if (!Object.hasOwn(PAIRS, word)) assert.equal(suggest(word), null, word);
  }
  assert.equal(suggest('constructor'), null);
});

test("the review's examples: the right suggestion or quiet", () => {
  const rightOrQuiet = { kissed: null, tapped: null, "you've": null, "she'd": null, ok: null, hoping: null,
    aple: 'apple', sno: 'snow', brane: null, elefant: 'elephant', drinkd: null, cameing: null, nite: 'night' };
  for (const [word, want] of Object.entries(rightOrQuiet)) {
    const got = suggest(word);
    assert.ok(got === null || got === want, `${word} -> ${got}`);
  }
  for (const word of ['drinked', 'slided', 'eggged', 'closeder', 'mousees']) assert.ok(!lists.common.includes(word), word);
});

test('a tie between equally close words stays quiet', () => {
  assert.equal(suggest('brane'), null); // brain or brave
  assert.equal(suggest('wich'), 'which'); // a hand-checked pair
});

test('300+ child misspellings: print each word and its suggestion; never a wrong one', () => {
  assert.ok(SLIPS.length >= 300, `only ${SLIPS.length}`);
  const wrong = [];
  let offered = 0;
  const out = SLIPS.map(([word, right]) => {
    const got = suggest(word);
    if (got) offered++;
    if (got && !right.split('|').includes(got)) wrong.push(`${word} -> ${got} (meant ${right})`);
    return `${word} -> ${got ?? '(quiet)'}`;
  });
  console.log(out.join('\n'));
  console.log(`${SLIPS.length} misspellings: ${offered} offered, ${SLIPS.length - offered} quiet, ${wrong.length} wrong`);
  assert.deepEqual(wrong, []);
  assert.ok(offered >= 150, `only ${offered} offered`);
});
