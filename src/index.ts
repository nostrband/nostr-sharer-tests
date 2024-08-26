import NDK, { NDKEvent, NDKRelaySet, NostrEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
// @ts-ignore
import BrowserHbs from "browser-hbs";

const OUTBOX_RELAYS = [
  "wss://purplepag.es/",
  "wss://user.kindpag.es/",
  "wss://relay.nos.social/",
];

const DEFAULT_RELAYS = [
  "wss://relay.nostr.band/all",
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
];

const ndk = new NDK({
  explicitRelayUrls: OUTBOX_RELAYS,
});
ndk.connect();

async function fetchById(id: string) {
  const { type, data } = nip19.decode(id!);

  let eventId;
  let pubkey;
  let d_tag;
  let kind;
  let relays;
  switch (type) {
    case "note":
      eventId = data;
      break;
    case "nevent":
      eventId = data.id;
      kind = data.kind;
      relays = data.relays;
      pubkey = data.author;
      break;
    case "npub":
      pubkey = data;
      kind = 0;
      relays = OUTBOX_RELAYS;
      break;
    case "nprofile":
      pubkey = data.pubkey;
      relays = data.relays || OUTBOX_RELAYS;
      kind = 0;
      break;
    case "naddr":
      pubkey = data.pubkey;
      kind = data.kind;
      d_tag = data.identifier;
      relays = data.relays;
      break;
    default:
      throw new Error("Bad id");
  }

  if (!relays || !relays.length) {
    relays = DEFAULT_RELAYS;
  }

  let event: NDKEvent | null;
  let filter: any = {};
  if (eventId) {
    filter = {
      ids: [eventId],
    };
  } else {
    filter = {
      authors: [pubkey],
      kinds: [kind],
    };
    if (d_tag !== undefined) {
      filter["#d"] = [d_tag];
    }
  }

  console.log("fetching", filter, "from", relays);
  event = await ndk.fetchEvent(
    filter,
    {
      groupable: false,
    },
    NDKRelaySet.fromRelayUrls(relays, ndk)
  );

  if (!event) return;

  let pubkeys = [];
  if (event.kind !== 0) pubkeys.push(event.pubkey);

  pubkeys.push(
    ...event.tags
      .filter(
        (t) => t.length >= 2 && t[0] === "p" && t[1] && t[1].length === 64
      )
      .map((t) => t[1])
  );

  // FIXME parse content extract nostr: links parse add to pubkeys

  let profiles: NostrEvent[] = [];
  if (event.kind === 0) profiles.push(event.rawEvent());
  if (pubkeys.length) {
    const events = await ndk.fetchEvents(
      {
        kinds: [0],
        authors: pubkeys,
      },
      {
        groupable: false,
      },
      NDKRelaySet.fromRelayUrls(OUTBOX_RELAYS, ndk)
    );

    profiles.push(...[...events].map(e => e.rawEvent()));
  }

  // parse profiles
  profiles.forEach((p) => {
    try {
      // @ts-ignore
      p.profile = JSON.parse(p.content);
    } catch (e) {
      console.log("Bad profile content", p, e);
    }
  });

  const result = {
    ...event.rawEvent(),
    author: profiles.find(p => p.pubkey === event!.pubkey),
    relatedProfiles: profiles
  };

  return result;
}

async function render() {
  const idInput = document.getElementById("id");
  const tmplInput = document.getElementById("template");

  const id = idInput!.getAttribute("value");
  // @ts-ignore
  const tmpl = tmplInput!.value;

  console.log("id", id);
  console.log("tmpl", tmpl);
  if (!id) throw new Error("No id");

  const event = await fetchById(id);

  const hbs = new BrowserHbs();
  hbs.handlebars.logger.level = 0;

  // the only thing we return is one template we have
  hbs.fetcher = (
    _: string,
    _1: string,
    cb: (e: any | null, data?: string) => void
  ) => {
    return cb(null, tmpl);
  };

  // start hbs
  hbs.init({
    partialsDir: {
      // a single partial with arbitrary name
      "/": ["template"],
    },
    cache: true,
  });

  // pre-cache partial templates
  console.log("caching hbs partials");
  await new Promise((ok) => hbs.cachePartials(ok));

  // get the partial we've just cached and compiled
  const partial = hbs.handlebars.partials["template"];
  console.log("partial", partial);
  if (partial === undefined) throw new Error("No template");

  // If the partial view is not compiled, it compiles and saves in handlebars
  if (typeof partial === "string") {
    hbs.registerPartial(partial);
  }

  const html = partial(event, {});
  console.log("html", html);
  const preview = document.getElementById("preview");
  preview!.innerHTML = html;
}

window.addEventListener("load", () => {
  console.log("starting");
  // @ts-ignore
  document.getElementById("ok").addEventListener("click", render);
});
