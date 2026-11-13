# The App:

The problems it tries to solve:

1. Websites exposes users to malicious code, a big part of the internet is malicious with viruses/adware/spyware/etc even if it's not malicious in the traditional term but also in dark patterns, addictive layouts, popups, elements everywhere, trackers, browser vulnerabilities or put simply anything that not user desired behavior is considered malicious. And all of that is because of the current systems of servers and clients and how they operate. So this system tries to solve this with the exact opposite which is starting with what the user needs from the server and not the server pushing whichever code it benefits their own goals on the user. And the best approach for this is simply using APIs and some other techniques but the philosophy itself is just whatever the user requires should be the only code running on the client side.
2.

What the app is:

1. One app for every internet API. The long-term goal: a single cross-platform app where every internet service is a plugin — a “unified API client” that replaces having a separate app for YouTube, Discord, Twitter, Instagram, Telegram, Reddit, TikTok, etc. There are a ton of clients for all different services like third-party YouTube clients, Twitter, Discord, Instagram, Telegram, Reddit, etc. but all of them suffer from the same issue, they are not as feature rich as the first-party client, and having to replicate all of the official features is a ton of work for a non-profit open-source application done by mostly a single developer. but what if we make an app that is a third-party client for all of them and pretty much any server ever existed on the internet to fetch data from all of them and put them all in the same place and all developers could work on it at the same time.
2. Content is organized by MEDIA TYPE, not by service. Types include: Posts/Threads, Shorts, Long Videos, Images, DMs/Chat, Live, Music, Books, Shopping, Anime/Manga, Recipes — but that's just an example of a few types it should be “theoretically infinite, one per API endpoint type.”
3. Global Features: Features attach to the media type, not the service. Auto-scroll for shorts → all shorts get it (TikTok + Reels + YT Shorts). Download → all images. Translation → all posts. the same full featured video player for all video types. Community-built features work everywhere instantly — “the community builds features once, and they work for every service with that media type.” No more waiting for YouTube to add a feature you want.
4. Built GRADUALLY. Start with one simple API plugin at a time. When multiple plugins produce the same media type, build a unified feed, then generalized features. “Architecture evolves organically as patterns emerge (no premature abstraction).” It’s “a long-term vision, not a right-now requirement.”
5. I'm not entirely sure if this system is gonna be front-end dependent or not, like do I have to choose a front-end, my plan with this system is to have it independent even from front-end engines by being agnostic so you write the frontend once in like a "design token" way but for the entire frontend but I don't think you can write a global frontend that gets interpreted into any other frontend engine like web, qt, gtk, kotlin, swiftui, etc without writing an interpreter for each. but if I have to choose something like web technologies, a HUGE rule is that this system should be completely FRAMEWORK-AGNOSTIC (using any framework) and FRAMEWORK-VERSION-AGNOSTIC (using any version of every framework).
6. For the frontend: developers would be able to make as many plugins for the same components as possible. For example, we need to slot the old player with the new one without any other changes.

## random app principles:

- Tab persistance: when you switch between tab they should show the data it already loaded as a default behavior. Maybe it could be toggled off as an option.
  - TODO: Tab persistance between restarts.
  - TODO: Default tab option.
  - TODO: empty feeds should show "Install sources to see *media here" button and directs to the marketplace.

- if there is a single feed there should be a plus button to add new feeds and if they add a new feed with no sources, the install new sources button should show
  - TODO: feed tab bar should auto-hide and show on hover to save space. Togglable.

- TODO: Hot-Module Reload

- when working with APIs or scrapers or any server of any kind, All data should be fetched even if it don't all get used. It could be used eventually.
