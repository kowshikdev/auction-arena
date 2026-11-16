# **AuctionArena — Complete End-to-End Product Requirements**

This is the consolidated product specification for the IPL-style multiplayer mock auction application, based on everything we've discussed so far.

The goal is not simply to build a bidding website. It is to create an **immersive, multiplayer IPL auction experience where friends can run their own franchise auctions in real time, communicate by voice, compete for players, and complete an entire auction together.**

I'll separate confirmed requirements from proposed implementation decisions so we don't accidentally treat assumptions as finalized features.

# **AuctionArena**

Working product name · Multiplayer IPL Mock Auction

[How to watch IPL auctions 2024 from India: TV channel and Live streaming details | Sporting News](https://images.openai.com/static-rsc-4/U2Xmh48x78RV_0y6yK1VY3llqijLXAs73vzEjOikcpGmGpycPFjXTEV_yWEE2r8_PjGZpKEKDzbIp6CDd02qFTVSnS1PogyrAOofvAxbF656T1om3PRpJocjzOzW2htFg-0V7zgx_RIuJCf5eiKsSdyGOMm7X_MKgTCop7LK1u0?purpose=inline)

[IPL 2025 mega auction: Countries with most players registered in the upcoming Indian Premier League auction | Sporting News](https://images.openai.com/static-rsc-4/q6utAcn9iPod7pN0xaFYoRsGFUI-sAQZVna4VfJJAJN4Y1A8giKoTKQ1ShKO1NxaquOTLe-pCvD8vCyFw1gOofWyC__5hrtUnzz82N19pQgizGImnubZoD0kXhAQjry0g7zhMhLOjpXbE7BfcTcjXLLERkHUTX1m2EkixXiV5c4?purpose=inline)

[IPL mega auction: Big-name veterans may not find initial takers | Cricket News - The Indian Express](https://images.openai.com/static-rsc-4/kfT-UEv4bdp7GOF7z3nuCutMoCuqpUf-sW1uBoBlvc0YaepMjpdmYpOoqSWavCL4DlgPkJQfVmBcmqxUH-wzAwuVdaniAR8_9tQlTMvC7eFWnbYskoYZnjO3ucaP2nwXixTRxT4ZS9V7RWu8UJ0eCR3j1wmvVo024UHpEM7f7bk?purpose=inline)

12

Multiplayer

Real-time bidding

Voice chat

Vercel-first architecture

## **1. Product vision**

Build a browser-based application where users can:

- Create a private auction room and invite friends.
- Join public rooms or get matched with random players.
- Select and manage one IPL franchise per participant.
- Participate in a live auction with real-time bidding.
- Speak to other participants using their microphones.
- Use either an automated system auctioneer or a human auctioneer.
- Build a squad while managing a fixed purse and squad restrictions.
- See live auction updates, player information, team budgets and auction history.

**Core experience:** A user should feel as though they are sitting at an actual IPL franchise auction table, not using a conventional online bidding form.

## **2. Users and roles**

The application should support these roles.

| Role                          | Responsibilities                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Host                          | Creates the room, configures settings, manages participants and starts the auction |
| Franchise owner / participant | Controls one franchise, bids for players and manages the squad                     |
| Human auctioneer              | Conducts the auction, advances players and manages auction flow                    |
| System auctioneer             | Automatically announces players, bids, countdowns and results                      |
| Spectator                     | Watches the auction without controlling a franchise (proposed future option)       |

A participant may also be the host or human auctioneer, depending on the room configuration.

**Important confirmed rule:** One participant controls exactly one franchise in a room. A single franchise cannot be controlled by multiple participants.

## **3. IPL franchises**

The application should initially support all 10 IPL franchises.

[Page 9: IPL 2023: Ranking 10 best logos](https://images.openai.com/static-rsc-4/TR1RePmksGePoppSm2U0Zgtguni0QiwaXNQvne1mthrcX4Ns5PZr6Pn8ipqrn5VSuaBHTBXbbWsLiRRAdGx_w7-_Uls8E4WTnPSMe4lMQS5UQ0ksocSupl99zu1B3bcCmw30nCZRr7jOrLJY6-bV2d2IoTDmf9vMv7HBvBxMUFw?purpose=inline)

**Chennai Super Kings**

[IPL 2022: Mumbai Indians create a bio-secure 'MI Arena' for players, families and support staff | Cricket News - Times of India](https://images.openai.com/static-rsc-4/SZqVNzDRnIw8nTqKiE8Y6A9IrQKx5StBa75F4Q0wwd948jkGbwTWh7EQdogtoycPtGXAkTRyYmjyNSUTTRWUmDfFLp3NLBLi5u55g20-Cea1HtldQFlFIBpdap8BhlGPmnB2wtT4IjFVy2JNeMjrB8AzZ5xfPAFCaQ30vVl2XBk?purpose=inline)

**Mumbai Indians**

[Match Details | RCB v PBKS, Tata Indian Premier League, 3 Jun | Match Centre](https://images.openai.com/static-rsc-4/OD_KgCwJxyfATTb-CiAhgYfiEtx7UYX7o20MtHtrqA0XxIxAfU3l5ti-0u0rI8nRz5xTe4fwFEBm1vJyv1eIrazEofjTBLWCYBFZ72npKeDebxcptdNEwN0jcxPBcsiLa2htaVjzpIQ2BAWFc-i09lY3GLeN0FjOsCKdc7uwE88?purpose=inline)

**Royal Challengers Bengaluru**

[KKR fans paint it purple with #MyPurplePassionStory](https://images.openai.com/static-rsc-4/BDompJblcK0yV9moeyBXwnoJH8VjiWBZhllWXrCQXeNlv9PJbaAJafNX6oPSX2NnfgTu0kzX_vNCdJxwsmcY4ofs0AogWHINsysVs510dDtmdMnEH1t4yEikjQiWJr8CBF3CqwJyZdCLQWU7WtA-WQRI0unlOATtw5V3zGkqMzk?purpose=inline)

**Kolkata Knight Riders**

[Page 7: IPL 2023: Ranking 10 best logos](https://images.openai.com/static-rsc-4/AGOrf4a7Vdb4LEfhpZclFHwDnvcEUVdn8Hn3vjCfX6MbxTZGJ6ZD06SD2gMnragxefveqEeoRGOyReKonNlu4gjsl8QaAncguRMkLhjJTrPirh4pz881RsKur9dsVlgSYPha0OGisZb5sJVT-zkpgkXJ0e3hR1mYzPt5_sOUyVM?purpose=inline)

**Sunrisers Hyderabad**

[Rajasthan Royals Cricket Team | RR | News & Matches](https://images.openai.com/static-rsc-4/3lZcaRgg-7YAaGVsY-xy3LFZP_JVs_LgzleaP0EqUNpQLQA-JgLunR8BozSfI-wiQXTmTeQBOWZsIYeREQdA9tdoZW69pFxemai79XN2Sq5OiVaXECm24mV4GZnIimPgMSlZY4eBHP2punYw4OA5myBCHVbLG01kqXokormhsDk?purpose=inline)

**Rajasthan Royals**

[Match Details | RCB v DC, Tata Indian Premier League, 18 Apr | Match Centre](https://images.openai.com/static-rsc-4/5bE5XNTXIEI47c0aLsyHQHmQkzNTR90ofUGanwUi6geMOVOmoy7M9aUrvbZMpKD8erVif-mIPDyqw7s4lTwllvZm-mRWL_zl1Kn8Z58VJo0GhiW95Y7w3CVvvK302RorqNk0ANrdq2KziwoUQjXFX8JkNDvNN-rM3M0cRpcsby0?purpose=inline)

**Delhi Capitals**

[IPL 2021: We want to play at home, say Punjab Kings | Cricket News - The Times of India](https://images.openai.com/static-rsc-4/J3P8m_uy88C9K_FA_lHibI-pTFtsRS6jLi-AjuqQY9NeKUaxKdpTxKPYycJvFYT8d9ApZtUPYxjpSwuFF7pPqZ8-cbXffSVj-pwr86lkek-CHZ9Z4u2nx75Jx33ryNfICc8jVQXNICx24DzwbGpx9-xrHqnNrGpgSHht2s4xwT4?purpose=inline)

**Punjab Kings**

[Gujarat Titans continue to champion sustainability at the world’s largest cricket stadium during TATA IPL 2025](https://images.openai.com/static-rsc-4/5IQkRMKHDdrKzyUNdf-mbGNE43CFAhbc23SOMq4DcOXGrQyMB2ewwZgCxfQB6ETRcPohVdBLarmP0TjUnim2uHNZu1xDbn3LleoklnJk2eGp6mljxBYNq3CiRbckXCRS2Mp-AevzuBHonrYg30l-q6wHYSm0BAmj-SYNGZeSaWQ?purpose=inline)

**Gujarat Titans**

[IPL 2025: Lucknow Super Giants' Performance in the Season- IPL](https://images.openai.com/static-rsc-4/LHJ5iXGI_i0cSJwwxeDW0ZIhem6DFY6Pzcvj3aZEkqSDhMJ2EWjOl6mokmv4hpyGuEFQMEDkHouF9LgZvj-jpJjqSnJ6TGXk2tzs8hp_OZDJYeQKGgPNwNP472BMu1x88W7aNn_RrA64LWzz1TfefuXTzjkLLLMEu3q6KctHAac?purpose=inline)

**Lucknow Super Giants**

### **Franchise selection rules**

- A room supports up to 10 franchise slots.
- A participant chooses one available franchise.
- Once selected, that franchise is unavailable to other participants.
- Participants can change their franchise before the auction starts, provided the replacement is available.
- Unoccupied franchises remain inactive.
- No two participants can control the same franchise.
- Each franchise has its own purse, squad and bidding history.

### **Minimum participant requirement**

Confirmed requirement

- Minimum participants to start: **4**.
- Four participants can start with four different franchises.
- The remaining six franchises are inactive.
- A room can have up to 10 franchise owners.
- The host can start the auction only when at least four eligible participants are ready and have selected their franchises.

## **4. Room creation and matchmaking**

This is one of the most important modules.

[Sunderfolk - Sunderfolk | Version 2.0 Deep Dive - Releasing 2026](https://images.openai.com/static-rsc-4/-8z-7wOQ5aYaYJzPphHV-fj42_KV8jQMMtfBLXGmO0M9ZNpijqUnTdtMjh_hWJrWk-3BfYddK-AzVKDe8HLjDIUZM_keAfiyH7UxlLawu5MjY8NN5kuVwACqrhyz6p8tLeXf7K1QSEV-DDS-IBzwlkNduY9Hz02rprjW7JgDuzU?purpose=inline)

[CS2 Match – table of players by Aleks Daiwer on Dribbble](https://images.openai.com/static-rsc-4/dG5C-5amWuSGlUdu8xSku0LeHYd66_UZqahGtvolngvPW7ZibYcaxRsZcHDk3Jj3l2yOLzwrzVZ5jo-WV5S0GnLo026elY52P_dyjdFwkvoORRWL30IN4aHOfPQbzgqiPa2V3kR-KgeZqKNPqh9iMcfcN1g-OVFwhKxv43Up49M?purpose=inline)

[Sunderfolk - Sunderfolk | Version 2.0 Deep Dive - Releasing 2026](https://images.openai.com/static-rsc-4/h2kFUeGyU6yRbnZ8XGHo0n_c02HNM1ROfA1RssriZKsNDko91khAtZ6tjX9L-UpA2kPzW0TCP6xanUAqJTrxbIcp-0n2N-IwivzIKWlYjzBfLbF5k5IFej_p9Ff1KNvHYRd_p_R2tQ2eyL9UfTEBGJFrX-iaOYmmWcekHetbDOc?purpose=inline)

10

### **A. Create a room**

A user should be able to create a room with:

- Room name.
- Private or public visibility.
- Maximum participants: 4–10.
- Auctioneer type: System or Human.
- Auction rules / settings.
- Optional password or invite restrictions.
- Optional room description.

After creation, the application generates:

- Unique room ID.
- Short room code.
- Shareable invitation link.

### **B. Join a private room**

Users should be able to:

1. Enter a room code or open an invitation link.
2. Authenticate or enter a display name, depending on the account design.
3. Join the lobby.
4. Select an available franchise.
5. Test their microphone.
6. Mark themselves ready.

The room should reject invalid codes, full rooms and duplicate franchise selections.

### **C. Public rooms**

Users should be able to:

- Browse available public rooms.
- See participant count.
- See selected auctioneer type.
- See whether the auction is waiting, starting or already running.
- Join an available slot.
- Filter rooms by available seats or auction settings.

### **D. Random matchmaking**

A user can select **Find Match**.

The system should:

1. Find an existing public room with available capacity.
2. Check whether it satisfies the minimum participant and room settings.
3. Assign the user an available franchise.
4. Create a new room if no suitable room exists, or put the user into a matchmaking queue.

The matchmaking experience should avoid placing a user into an auction that has already started unless the room explicitly allows late entry.

## **5. Lobby experience**

The lobby is where participants gather before the auction begins.

It should show:

- Room name and room code.
- Copy invitation link.
- Host identity.
- All 10 franchise slots.
- Selected and unselected franchises.
- Participant names and profile images.
- Online/offline status.
- Ready/not-ready status.
- Microphone permission and mute status.
- Selected auctioneer.
- Auction configuration summary.
- Start auction button.

### **Starting conditions**

The Start Auction button should remain disabled until:

- At least four participants have joined.
- Each active participant has selected a unique franchise.
- The required participants are ready.
- Auction settings are valid.
- The player catalogue and auction session have been initialized.

If a participant disconnects before the auction starts, their slot should be marked disconnected and the host should be able to wait, remove them or invite another user.

## **6. Auction configuration and rules**

The room host should be able to configure the auction before starting.

Suggested settings:

| Setting               | Proposed default         |
| --------------------- | ------------------------ |
| Auction purse         | ₹100 crore per franchise |
| Maximum franchises    | 10                       |
| Minimum participants  | 4                        |
| Maximum participants  | 10                       |
| Squad size            | 25 players               |
| Minimum squad size    | 18 players               |
| Overseas player limit | 8                        |
| Bid timer             | 20 seconds               |
| Auctioneer            | System                   |
| Auction format        | IPL-style                |
| Currency              | INR / crore              |

These are proposed initial defaults, not finalized rules. We should make them configurable rather than hard-code them.

### **Auction formats**

Potential formats:

- Standard auction.
- Accelerated auction.
- Custom auction.

### **Important auction rules to implement**

- Base price.
- Bid increments.
- Minimum valid bid.
- Maximum affordable bid.
- Countdown reset after a valid new bid.
- Player sold.
- Player unsold.
- Player withdrawn.
- Team purse deduction.
- Squad-size enforcement.
- Overseas-player restriction.
- Role/category tracking.
- Auctioneer control.
- Player queue management.
- Auction completion.

### **Bid increments**

The increment table should be configurable. For example:

| Current bid range | Illustrative increment |
| ----------------- | ---------------------- |
| Below ₹1 crore    | ₹0.05 crore            |
| ₹1–2 crore        | ₹0.10 crore            |
| ₹2–5 crore        | ₹0.20 crore            |
| Above ₹5 crore    | ₹0.25 crore            |

The exact rules should be selected and verified against the chosen auction format.

## **7. Player database and catalogue**

This needs to be a proper structured database, not a collection of hard-coded player names.

[IPL 2025 mega auction: Countries with most players registered in the upcoming Indian Premier League auction | Sporting News](https://images.openai.com/static-rsc-4/q6utAcn9iPod7pN0xaFYoRsGFUI-sAQZVna4VfJJAJN4Y1A8giKoTKQ1ShKO1NxaquOTLe-pCvD8vCyFw1gOofWyC__5hrtUnzz82N19pQgizGImnubZoD0kXhAQjry0g7zhMhLOjpXbE7BfcTcjXLLERkHUTX1m2EkixXiV5c4?purpose=inline)

[South Africa’s Morris smashes IPL auction record with $2.25 million fee - Sports | Daily Mirror](https://images.openai.com/static-rsc-4/eqakQj78NtOzeRLm2WxvLT1z9Rhccu5JxJQNh_H9pK2E8qUCiFSIHkV3ZwSWpJiswRsOmZNx5V7_HXPX6NEKRtNZuqnbg6FMFoo-m9qg_J9ycPesVc23HA1-cplXfCoZiz7lJgvjlELA_nu7BM9j9MV5LIccyBs03sHs5rjz434?purpose=inline)

[IPL 2023 Season Review: Mumbai Indians (MI)](https://images.openai.com/static-rsc-4/A8S_HqSlTJggTB0xaBEfOZxlVXNymmECz2CPdpn-TdWeMU254sF0zG6-mAHKZmQ5_VJ09ku0WAycw-JE5c9nsTVCIUMT3oIYhIUHVJjsJJI6RDj5V-8SidbaK5f_KnWOEbrI7aef9px04DeZndc0dE3xeD1qFS0yLdF0XzaSOe0?purpose=inline)

9

Each player should have:

| Field            | Description                               |
| ---------------- | ----------------------------------------- |
| Player ID        | Unique identifier                         |
| Full name        | Player name                               |
| Photo            | Player image                              |
| Country          | Nationality                               |
| Player type      | Batter, bowler, all-rounder, wicketkeeper |
| Batting style    | Right/left-handed                         |
| Bowling style    | Bowling type                              |
| Base price       | Auction starting price                    |
| Experience       | Domestic/international                    |
| Statistics       | Relevant career statistics                |
| Overseas status  | Indian or overseas                        |
| Auction category | Player group / auction set                |
| Availability     | Available, sold, unsold, withdrawn        |

### **Player catalogue features**

- Search players by name.
- Filter by role.
- Filter by nationality.
- Filter by base price.
- Filter by auction category.
- Sort by player name or price.
- View detailed player profiles.
- See sold and unsold status.
- Import player data from an administrator-managed dataset.

The catalogue must support season-specific datasets. Player availability, statistics and franchise associations can change between seasons, so we should not treat old player lists as current.

## **8. The actual auction room**

This is the heart of AuctionArena.

[Free Player Auction Software — Cricket, Football, Basketball & More](https://images.openai.com/static-rsc-4/cnifJgTGboyV7yjInww27zbgJZoYZ1xOygjWVGngPQGVH5acbD8NywHAZoQh0Fjbeq7WJMD83tiHvSmX7e9EFgKirSiUHKYXC1D0uJn-SabkXBXNTkupt4oEp_cAYTt29-nsbNYPmt9Fh5bBJ1mlt2d_M2e-dCGPjSBELkzvqWQ?purpose=inline)

[Player Auction Software for Sports Tournaments | SportsGenX](https://images.openai.com/static-rsc-4/5gU5XGGxDHS7cr7mgEXaE7szNH1aC5GoRbI5tPDw3kPOX7JANdhjWzpTJOjdgXKhr-GgDlWRXY_nPRi37FlJNd5H5xVBoStxDNb9YwrnuamwFXse296uyOSCZTMfz0H9yDjegLFJTDd99sq4FxM40BlNR9rrT9CHMEPtmwD7dWE?purpose=inline)

[IPL Auction 2025: Full updated squads, IPL players list, and final teams of all 10 IPL franchises after IPL 2025 mega auction | Cricket News - Times of India](https://images.openai.com/static-rsc-4/iBBSYXacO1trch6O_rfbRAo1QM973UxcrAARevyuwJeMg5-q0D6rFejgSDhgYza4vFt7wr8OAV2Qn5SooV8bGsKapEuTyOhEe442DnHJ-I0JGWmV1ReqrjUDo5HiBtiXVU9PY0EM2iGrtkKUGkvvntJtn0vVll5DQI1319x6xlg?purpose=inline)

10

The auction room should be designed as an immersive full-screen dashboard.

### **Suggested screen layout**

**AUCTIONARENA**

LIVE AUCTION

CURRENT PLAYER

LOT #024

[KL Rahul Net Worth 2024: Bio & Info - ChotaNagrik](https://images.openai.com/static-rsc-4/qC4bOat0V5XlcyXCwV2if3N3H972oayrYO4SOdFyUriU0HNSR9wUiJya3uklbPyfrEBdME9fcgJWr9u_2y4KpAptnKT-jUcH4wiUis2xi1CiWsDFZlvebLUmLxfjgYTyinuiZhkRy-mAS2dYragEHppb1bGVUnscwIcKMZtKIQY?purpose=inline)

# **PLAYER NAME**

BATTER · INDIA

# **₹2.00 Cr**

BASE PRICE

CURRENT HIGHEST BID

# **₹5.20 Cr**

FRANCHISE NAME

# **00:12**

COUNTDOWN

YOUR PURSE

## **₹94.80 Cr**

YOUR SQUAD

## **04 / 25**

**TEAM BIDDING**

CSK

₹5.20 Cr

MI

₹4.80 Cr

RCB

₹4.60 Cr

SRH

—

## **BID +**

Next valid bid

## **PASS**

Do not bid

Illustrative layout only — not a live auction.

The actual production screen should include these areas:

**A. Player presentation**

- Large player photo.
- Name, country and role.
- Base price.
- Career statistics.
- Auction category.
- Current auction status.

**B. Live bidding**

- Current highest bid.
- Highest-bidding franchise.
- Next valid bid amount.
- Countdown timer.
- Bid button.
- Pass / stop-bidding control.
- Bid history.

**C. Franchise scoreboard**

- All active franchises.
- Franchise logos.
- Current purse.
- Players purchased.
- Current highest bid.
- Squad status.

**D. Auction information**

- Current lot.
- Upcoming player queue.
- Sold players.
- Unsold players.
- Auction progress.

**E. Communication**

- Participant voice controls.
- Auctioneer voice status.
- Microphone status.
- Chat / text messages.
- System notifications.

## **9. Bidding engine — the most important backend feature**

The bidding engine must be authoritative and reliable.

A bid should follow this process:

1. Participant presses the Bid button.
2. Frontend sends the bid request to the server.
3. Server checks that the auction is running.
4. Server checks that the participant owns the franchise.
5. Server checks that the participant is allowed to bid.
6. Server checks that the bid is higher than the current bid.
7. Server checks the franchise's available purse and squad constraints.
8. Server records the bid atomically.
9. Server updates the current highest bidder.
10. Server resets the countdown.
11. Server broadcasts the accepted bid to everyone in the room.

If the bid is invalid, the server rejects it and returns a meaningful reason.

### **Critical edge cases**

- Two participants bid at almost exactly the same time.
- The timer expires while a bid request is being processed.
- A participant disconnects during bidding.
- A franchise does not have enough purse.
- A franchise reaches its squad limit.
- A participant tries to submit a duplicate request.
- A stale client tries to submit a bid based on an old auction state.

The server must resolve all of these consistently.

**No client-side winner decisions.** The database transaction and server-side auction engine determine the winning bid.

## **10. System auctioneer and human auctioneer**

[Who is Mallika Sagar? First Woman Auctioneer To Host IPL Auction 2024 LIVE - Oneindia News](https://images.openai.com/static-rsc-4/Nbm60N6p3rfzQq-W-L2WENxfk7ya63GMO9YqedKSP3nVdK2uPPca-RkRkAYBn6jebU_E5OTorpMEFN7jNIwxBVlLaTFnD212AdRHPBgTOBabGwI6Qd9bNgZBp3--tYqQTNH-rGGW1N8i_3nNOlztrYM7zf_lLq7h0qmU9Sbxk_Q?purpose=inline)

**Human auctioneer**

- A participant controls the auction.
- Announces the next player.
- Opens bidding.
- Controls the countdown and auction flow.
- Declares sold or unsold.

[AI-Generated Voice Recording & Futuristic Microphone Soundwave Videos | vivago.ai](https://images.openai.com/static-rsc-4/lcpbPmnBJ1PzU7ioEZHHN7ZArksYXf5esxQnYJSMzmY9YXXxO1RvJFvsX2mOX7SsBgHt4z4pNUwuVZUDWIdoforCuXAGGr-7TYzGDu_o27Eo15fWRIoZAL9iy09eDb7Rdm_rf7-hMoMSi-7PvQ-TgkO35uc6R6IEryeo_Ty2LqU?purpose=inline)

**System auctioneer**

- Automatically announces players.
- Announces current bids.
- Announces countdown warnings.
- Declares sold or unsold.
- Advances the auction automatically.

### **Human auctioneer permissions**

A human auctioneer should be able to:

- Start and pause the auction.
- Present the next player.
- Open and close bidding.
- Control the countdown.
- Declare sold or unsold.
- Move to the next player.
- Skip a player.
- Handle eligible auction corrections.
- Pause the room for technical issues.

The host should be able to appoint the auctioneer and, if needed, transfer that role.

### **System auctioneer voice**

The automated auctioneer should use text-to-speech.

Example announcements:

- "Welcome to the AuctionArena auction."
- "Up next, Rishabh Pant. Base price: two crore."
- "CSK bids two crore."
- "Mumbai Indians raises to two crore twenty lakh."
- "Going once..."
- "Going twice..."
- "SOLD to Chennai Super Kings!"

These announcements must be triggered by real server-side auction events. They should not run on an independent timer that can announce incorrect results.

## **11. Live voice chat**

[아미 KSG](https://images.openai.com/static-rsc-4/nrKLV3ELFzN9p1Ce2iRuViqWypZiagega9wj5_yclf3NkvIyfl4Ej919G11WwkH7_eRzY1Y6fkCALo_9KRzjwv8VYZKBDPfHOjMx7oQwhLlp5gTUiEMQ-WyASDHNCaB11hTeLs7jM_z6LglTylWV1IJVMK-oyVs3EEAM5qIpcU8?purpose=inline)

[ROOMS VC 🎙️ | Play on Roblox](https://images.openai.com/static-rsc-4/pbsWk6uGzlhzUm-noo4JBUve2OCHYJXDL7ZvD1F8BOWUNPkXToPYjHN8JG-BqXXX2bkT2ZqPpdKuGVENOA81gFMbgVLD4XPf0ijhBtlW1EoKAyqYNKGXOq_b6NEesjSi91RNfpGWl_-0kTQpTGctJEFjyuh53NxQisGtqKculzU?purpose=inline)

[フェンリル、Apex Legends ™ のためのコミュニケーションスペース「WINNITY」を提供開始 | フェンリル株式会社のプレスリリース](https://images.openai.com/static-rsc-4/7q3CUV7yQgmC-z3RE3RdGH0sB5VzlXJV0hnbaLxufOTv8qouKtJ3DglRg051ZOwajec7I1mJ3sj-Rg5TYXGT5lQW_BiJ4fyLQJqNIh-Pr-PAChYOHLQDZFNhEtqg3L1A2Z7cxgZnE3ccx_YCLHk0qD1YrojH0cbV5lrI5bSkLzs?purpose=inline)

8

This is a confirmed requirement.

Participants should be able to talk to each other while the auction is in progress.

### **Voice features**

- Microphone permission request.
- Join and leave voice channel.
- Mute and unmute.
- Push-to-talk option.
- Speaking indicator.
- Participant audio status.
- Volume control.
- Reconnection after network interruption.
- Auctioneer priority / optional priority mode.

### **Suggested voice permissions**

| User              | Voice capability                   |
| ----------------- | ---------------------------------- |
| Franchise owner   | Speak and listen                   |
| Host              | Speak and listen                   |
| Human auctioneer  | Speak and listen                   |
| System auctioneer | Play generated voice announcements |
| Spectator         | Listen by default (proposed)       |

Voice must continue to work independently of the bidding event channel. We should not send microphone audio through the database or ordinary auction event broadcasts.

## **12. Team purse and squad management**

Each franchise must have a separate live purse and squad.

The franchise dashboard should show:

- Initial purse.
- Remaining purse.
- Amount spent.
- Players purchased.
- Squad size.
- Indian players.
- Overseas players.
- Batters.
- Bowlers.
- All-rounders.
- Wicketkeepers.

When a player is sold:

1. Winning franchise is identified.
2. Winning bid is deducted from its purse.
3. Player is assigned to that franchise.
4. Squad count is updated.
5. Player status becomes sold.
6. The auction event is recorded.
7. All room participants receive the updated state.

The same player must never be purchased by two franchises in the same auction.

## **13. Auction results and post-auction experience**

Once all eligible players have been processed, the auction should end.

The application should generate:

### **Franchise-wise summary**

- Franchise name and logo.
- Total purse spent.
- Remaining purse.
- Players purchased.
- Unsold / unfilled squad positions.
- Player-by-player purchase details.
- Role breakdown.
- Overseas-player count.

### **Overall auction summary**

- Total players presented.
- Players sold.
- Players unsold.
- Highest-priced player.
- Most active franchise.
- Highest spending franchise.
- Average sale price.
- Total auction spending.

### **History**

- Full bid history.
- Sold and unsold player list.
- Auction timeline.
- Final squad lists.
- Participant and franchise mapping.

Users should be able to revisit previous completed auctions. This also provides the foundation for future leaderboards and rankings.

## **14. UI/UX and design requirements**

The experience should feel like a combination of a professional cricket auction broadcast and a modern multiplayer game.

### **Design direction**

[Sports live Score | Dashboard by SK Billal Hossain on Dribbble](https://images.openai.com/static-rsc-4/QEnhjv2S3FNHq-a_tJ_6Tv0J6SSZDqfTZiI8VqiPbeOULldSoTxlgZAd2mCI12WTSujwWw9rtlHqiVl7OLk_b3TmLVH1dsm4JF6xf0aprbyPZ_MSD84BLDixKEJF92wNyL2cP7H2E-Mi_gutfzwWQvce9QwL2404uT8h60Xpgf8?purpose=inline)

[Sorare Player page - Desktop by Dac Davy NGUYEN on Dribbble](https://images.openai.com/static-rsc-4/utNZ-TL49kjvFhn-hnIJCDpI5iyEJ4WSDh9XzqT6wlP0UZqeF6_pds9S_2hrVkCnbtxSGyg4Sq58k47kyVRTZ7_ctw2BcBSQfxT0_eAMM2APg2OcPXEPVEKeZB9ejfqEKMMJMFhMzQsn4KA-iHXrS1RxdsMYRm-6B6U7HaMojfE?purpose=inline)

[Indian Premier League 2026: The architectural stories behind all 10 iconic home stadiums | Architectural Digest India](https://images.openai.com/static-rsc-4/ndz8nIh_QohQuzU42I9o9vQImWQe4-wlqSr-Jj0I6xZ88Y4lMZoQkVKrnEup1PWmSRqcwf9Ebv_zJXjPuq4FjaRFqGV08L5RnYnml0FFh9kNWIGV3Z0QArFAmJ_WJu0aaD0Bsoh9icphDJC0D_iD-OKMYC2gNLtvhUu74dfWBOs?purpose=inline)

11

Proposed design system:

- Dark premium interface.
- Stadium-inspired background.
- Team-specific colors and logos.
- Large, clear player cards.
- Prominent countdown timer.
- Smooth animations and transitions.
- Responsive layout for desktop, tablet and mobile.
- Clear audio and microphone controls.
- Fast updates without page refresh.

### **Important animations and effects**

- Player reveal animation.
- New bid animation.
- Highest-bidder highlight.
- Countdown warning animation.
- Sold hammer / gavel effect.
- Unsold announcement.
- Winning franchise celebration.
- Squad update animation.
- Auction completion screen.

### **Sound design**

- Auctioneer announcements.
- Bid accepted sound.
- Countdown warning.
- Sold sound.
- Unsold sound.
- Optional stadium/crowd ambience.

Sound effects should be optional and user-controlled. Audio should never interfere with voice communication or make important information inaccessible.

## **15. Authentication, profiles and user management**

I recommend supporting accounts rather than relying only on display names.

Features:

- Sign up and login.
- Google login as an optional provider.
- User profile.
- Display name.
- Profile picture.
- User's auction history.
- Invitations.
- Room membership.
- Session management.

Guest joining can be considered for a later version, but authenticated users make room ownership, recovery and auction history much easier.

## **16. Reliability, security and fairness**

These are essential for a proper multiplayer product.

- Server-side bid validation.
- Database transactions for bids and player purchases.
- Unique franchise assignment within each room.
- Room access controls.
- Private-room authorization.
- Secure invitation tokens.
- Rate limiting for bids and room actions.
- Duplicate request protection.
- Persistent auction state.
- Reconnect and resynchronization.
- Host and auctioneer permissions.
- Audit log of important actions.
- Database backups.
- Recovery after a server or browser interruption.

If a participant refreshes their browser, they should return to the same auction state and franchise rather than losing their place.

### **Disconnect and recovery behaviour**

The application should handle these situations without corrupting the auction:

- If a franchise owner disconnects, their franchise remains assigned to them.
- Their existing bids remain valid.
- Other participants can continue bidding.
- On reconnect, the user receives the latest authoritative auction state.
- If the host disconnects, host permissions can transfer or the room can enter a controlled pause.
- If the human auctioneer disconnects, the host can appoint another auctioneer or switch to the system auctioneer if the room permits it.
- If the system experiences an outage, the auction should pause safely and resume from the last committed event.

A room should never award a player based only on a browser's local countdown.

## **17. Recommended technology and hosting architecture**

Based on your requirement to host the application primarily on Vercel, this is the architecture I recommend.

## **AuctionArena technical architecture**

**Frontend — Next.js + TypeScript**

Desktop, mobile, lobby, auction room and user dashboard

**Vercel — Application hosting**

Next.js pages, Route Handlers and server-side auction logic

**Supabase**

PostgreSQL, Auth, Realtime, Presence

**LiveKit**

Microphone, voice rooms and audio transmission

**Auction engine and event history**

Authoritative bid processing, purse calculations, player allocation and recovery

### **Technology choices**

| Component                   | Recommended technology          |
| --------------------------- | ------------------------------- |
| Frontend                    | Next.js App Router              |
| Language                    | TypeScript                      |
| Styling                     | Tailwind CSS                    |
| Animations                  | Framer Motion                   |
| Application hosting         | Vercel                          |
| Database                    | Supabase PostgreSQL             |
| Authentication              | Supabase Auth                   |
| Real-time events            | Supabase Realtime               |
| Online participant tracking | Supabase Presence               |
| Voice chat                  | LiveKit Cloud                   |
| Auction announcements       | Browser or server-generated TTS |
| Validation                  | Zod                             |
| Testing                     | Vitest + Playwright             |
| Source control              | GitHub                          |

### **Why this architecture?**

- Vercel hosts the frontend and server-side application code.
- Supabase manages persistent data, user authentication and room events.
- LiveKit manages real-time voice communication.
- The server processes every bid and stores the result before broadcasting it.

This is a Vercel-first architecture, not literally a system where every service runs inside Vercel. Supabase and LiveKit remain managed external services.

**Important:** We should not make the auction depend on one Vercel function instance maintaining a long-lived in-memory room. Room state must be shared and persistent. Realtime delivery is not the source of truth; the database and server-side auction engine are.

## **18. Database design**

The following is the proposed initial database structure.

| Table               | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `profiles`          | User profiles and display information             |
| `franchises`        | The 10 IPL franchise records                      |
| `players`           | Player catalogue                                  |
| `player_seasons`    | Season-specific player information                |
| `rooms`             | Room configuration and status                     |
| `room_members`      | Participants and their room roles                 |
| `room_settings`     | Auction rules and configuration                   |
| `auction_sessions`  | Auction session state                             |
| `auction_lots`      | Ordered players in an auction                     |
| `bids`              | Accepted and rejected bid records, as appropriate |
| `team_squads`       | Players purchased by franchises                   |
| `auction_events`    | Ordered event history                             |
| `matchmaking_queue` | Users waiting for a public match                  |
| `notifications`     | Room and auction notifications                    |

### **Important database relationships**

- One user can join multiple rooms over time.
- One room has multiple participants.
- One room has at most one active owner per franchise.
- One room has one auction session.
- One auction session has multiple player lots.
- One player can be sold only once within an auction session.
- One franchise has one squad per auction session.
- Each accepted bid belongs to one participant, franchise, room and player lot.
- Auction events have an ordered sequence number.

The auction engine should use atomic database transactions and suitable locking to prevent simultaneous bids from producing inconsistent winners.

## **19. Backend API requirements**

These are the main API groups we should implement.

| API group              | Responsibilities                      |
| ---------------------- | ------------------------------------- |
| `/api/rooms`           | Create, list, view and update rooms   |
| `/api/rooms/join`      | Join using a room code or invitation  |
| `/api/rooms/leave`     | Leave a room                          |
| `/api/rooms/ready`     | Change readiness status               |
| `/api/rooms/franchise` | Select or change franchise            |
| `/api/auctions/start`  | Validate and start an auction         |
| `/api/auctions/state`  | Fetch the authoritative auction state |
| `/api/auctions/next`   | Advance to the next player            |
| `/api/auctions/pause`  | Pause an auction                      |
| `/api/auctions/resume` | Resume an auction                     |
| `/api/bids`            | Submit and validate bids              |
| `/api/auctions/sold`   | Finalize a player sale                |
| `/api/auctions/unsold` | Finalize an unsold player             |
| `/api/players`         | Search and retrieve players           |
| `/api/teams`           | Fetch squad and purse details         |
| `/api/livekit/token`   | Generate authorized voice-room tokens |
| `/api/matchmaking`     | Join and leave matchmaking queues     |
| `/api/history`         | Retrieve completed auctions           |

We should use a consistent response format, meaningful error codes, authentication checks and request validation for all endpoints.

## **20. Real-time event system**

The application needs a clearly defined event protocol so every participant sees the same auction.

Suggested events:

| Event                | Purpose                     |
| -------------------- | --------------------------- |
| `participant_joined` | User joined the room        |
| `participant_left`   | User left the room          |
| `participant_ready`  | Readiness changed           |
| `franchise_selected` | Franchise selection changed |
| `auction_started`    | Auction began               |
| `player_presented`   | Current player changed      |
| `bid_accepted`       | New bid accepted            |
| `countdown_updated`  | Auction countdown changed   |
| `player_sold`        | Player sold                 |
| `player_unsold`      | Player unsold               |
| `purse_updated`      | Franchise purse changed     |
| `squad_updated`      | Franchise squad changed     |
| `auction_paused`     | Auction paused              |
| `auction_resumed`    | Auction resumed             |
| `auction_completed`  | Auction finished            |

Every event should carry a room ID, auction ID, event ID, sequence number and timestamp where appropriate.

Clients should detect missing sequence numbers and fetch a fresh snapshot rather than assuming they received every event.

## **21. Project structure**

I recommend a single Next.js application repository rather than maintaining separate frontend and FastAPI backend projects for the initial version.

```
auctionarena/
│
├── app/
│   ├── page.tsx
│   ├── login/
│   ├── register/
│   ├── dashboard/
│   ├── lobby/[roomId]/
│   ├── auction/[roomId]/
│   ├── results/[auctionId]/
│   ├── profile/
│   └── api/
│       ├── rooms/
│       ├── auctions/
│       ├── bids/
│       ├── players/
│       ├── teams/
│       ├── matchmaking/
│       └── livekit/
│
├── components/
│   ├── layout/
│   ├── dashboard/
│   ├── lobby/
│   ├── auction/
│   ├── players/
│   ├── teams/
│   ├── voice/
│   └── shared/
│
├── lib/
│   ├── supabase/
│   ├── auction-engine/
│   ├── realtime/
│   ├── livekit/
│   ├── validations/
│   └── permissions/
│
├── hooks/
├── types/
├── data/
├── supabase/
│   └── migrations/
│
├── public/
│   ├── images/
│   ├── logos/
│   └── sounds/
│
├── tests/
├── .env.example
├── package.json
└── README.md
```

## **22. Complete page-by-page application scope**

This is the full list of pages I would expect to build.

[Landing Page – Esports Gaming Platform Interface by Demi UI/UX ✨ on Dribbble](https://images.openai.com/static-rsc-4/4rvMpQHc-zCFyl9h_rLYtasUwVKMYbcDpb1Y4yrOEv3pFtjsMFj2nKJA3V9jSZ3GGGb4Mf0E_nAIbl5JBRPGck1dV8E_EO-ITPNYBri7qSmzbOavGQYZ5jM7r9ivoYcFHjjL3KYz8ME_plOu3aipFIgs32_CJUrzrQZ-_H5thTs?purpose=inline)

**1. Landing page**

- AuctionArena branding.
- Create room / Join room.
- Find a public match.
- How it works.
- Login and registration.

[Neon Dashboard designs, themes, templates and downloadable graphic elements on Dribbble](https://images.openai.com/static-rsc-4/tZmRrJeFMO-gl4StGKUMrCoBvqeonutcF4GmkuF_B0jsxhgIoT4PiSEPVG5dUWX9pICLUYqd4oME9z4CRb8gdeMe6wqAydrm7FB4sBWz-cD1UlF3tVSCyZBeeYjzqs5Ao8i5m5hf_3Vudlh9XlUnyhYae4pOCZ1UxwEvhFjKrlo?purpose=inline)

**2. User dashboard**

- Profile and account details.
- Create auction.
- Join with room code.
- Public room browser.
- Recent auctions.
- Matchmaking.

[Sunderfolk - Sunderfolk | Version 2.0 Deep Dive - Releasing 2026](https://images.openai.com/static-rsc-4/-8z-7wOQ5aYaYJzPphHV-fj42_KV8jQMMtfBLXGmO0M9ZNpijqUnTdtMjh_hWJrWk-3BfYddK-AzVKDe8HLjDIUZM_keAfiyH7UxlLawu5MjY8NN5kuVwACqrhyz6p8tLeXf7K1QSEV-DDS-IBzwlkNduY9Hz02rprjW7JgDuzU?purpose=inline)

**3. Room lobby**

- Participants and franchise selection.
- Room settings.
- Ready status.
- Microphone test.
- Invitations.
- Host controls and start button.

[Free Player Auction Software — Cricket, Football, Basketball & More](https://images.openai.com/static-rsc-4/cnifJgTGboyV7yjInww27zbgJZoYZ1xOygjWVGngPQGVH5acbD8NywHAZoQh0Fjbeq7WJMD83tiHvSmX7e9EFgKirSiUHKYXC1D0uJn-SabkXBXNTkupt4oEp_cAYTt29-nsbNYPmt9Fh5bBJ1mlt2d_M2e-dCGPjSBELkzvqWQ?purpose=inline)

**4. Live auction room**

- Player presentation.
- Bidding and countdown.
- Franchise scoreboard.
- Voice chat.
- Auctioneer controls.
- Live activity and player queue.

[AI Sports Franchise Management Dashboard by MindInventory UI/UX for MindInventory on Dribbble](https://images.openai.com/static-rsc-4/SIvykPtUSZ4SdCw1aqdeN889GtgoIKmJQNCFuQaVwd0XnveQHciJGRP1NmbCBQ7njQy7cAFjZIrNEX-Q6Jr0H-mlGHFueeonBeZGqkpPl8G38tqA4rAM4f0OJM3XJvLZBw740ek1FX6iCdF1Xcs7b-wv_Kve0F6trpCMnWUWy1U?purpose=inline)

**5. Franchise squad page**

- Purchased players.
- Squad composition.
- Remaining purse.
- Player roles and statistics.
- Spending summary.

[Tournament Bracket Maker — Free & Beautiful | Rise](https://images.openai.com/static-rsc-4/OOTz6xG84mlNSO8qcvnfySLaXOiQ4MriTyl3mSRfa16aordNpZUYvfsFtVQCsKSkfCl41rL7yNRKj1pAWQ4TOjc3PkNvnn3HNbkwi9CLnQ8VjJJ70IRH3jpAOBMOK_dY0TrEJgi09169M8YsEEbbLBOopWQ6Wsfzj4u1Fa1ZnEs?purpose=inline)

**6. Auction results**

- Final squads.
- Spending leaderboard.
- Highest-priced players.
- Sold / unsold list.
- Auction history.

[Football Manager - Dashboard by Leonid Bogdanovich on Dribbble](https://images.openai.com/static-rsc-4/bjSIBQZQ07bRIzwG6AZ2iaLxf31uZw-yDaSUPvW-mSIP3BXU-7ptD_kmwfhOc5wz88mxLuWsSe82_pxe18dp3JR1MLvhRv4PwPIsN1ye2iqQGkMynze6m0SZdq9ufsY6CqcPSm88Iw27a_8vxUodB3Ls8lc83dYqAnChMp05n8U?purpose=inline)

**7. Admin dashboard**

- Manage player database.
- Manage seasons and franchises.
- Manage player images and statistics.
- Configure default auction rules.
- Review reported issues.

## **23. Admin and data management**

We need an admin interface because player lists, seasons and auction rules will change.

An authorized administrator should be able to:

- Add, edit and remove player records.
- Upload player images.
- Import players using CSV.
- Create a season-specific catalogue.
- Update base prices and player categories.
- Activate or deactivate players.
- Configure auction rules.
- View completed auction records.
- Manage problematic rooms and users.

The admin panel should be separate from normal participant controls, protected by server-side permissions.

## **24. Testing and quality requirements**

This application will have multiple people interacting with the same data simultaneously. Testing is especially important.

| Test category        | What to verify                               |
| -------------------- | -------------------------------------------- |
| Authentication       | Login, logout and access restrictions        |
| Room management      | Create, join, leave and invite               |
| Franchise assignment | No duplicate franchise owners                |
| Minimum participants | Cannot start with fewer than four            |
| Readiness            | Start only when requirements are met         |
| Bidding              | Valid bids and bid increments                |
| Concurrency          | Simultaneous bids produce one correct result |
| Purse                | No overspending                              |
| Squad                | Squad and overseas limits                    |
| Auctioneer           | Human and system auction flow                |
| Realtime             | Every participant sees consistent updates    |
| Voice                | Microphone, mute and reconnect               |
| Recovery             | Refresh and reconnect preserve state         |
| Results              | Correct squad and spending summaries         |
| Security             | Unauthorized actions are rejected            |

### **Important acceptance tests**

The following should be treated as release blockers:

1. Four friends can create and start a private auction.
2. All four can select different franchises.
3. A fifth person cannot take an already occupied franchise.
4. Two people bidding simultaneously cannot both win the same player.
5. A franchise cannot spend more than its remaining purse.
6. All participants see the same accepted bid and winning franchise.
7. A disconnected participant can reconnect without losing their franchise.
8. The auctioneer can pause and resume the auction.
9. A completed auction produces correct franchise squads and spending summaries.
10. The application can recover auction state after a server restart.

## **25. Development roadmap**

I would not attempt to build all the features simultaneously. We should develop this in stages, with a working application at the end of each stage.

1. **Phase 1 — Project foundation and UI**
   - Create Next.js application.
   - Configure Tailwind and design system.
   - Build landing page and dashboard.
   - Build room lobby.
   - Add franchise cards and selection.
   - Prepare Supabase connection.

   Foundation milestone
2. **Phase 2 — Authentication and room management**
   - Authentication and user profiles.
   - Private room creation.
   - Join by room code.
   - Public room listing.
   - Franchise allocation.
   - Ready status.
   - Four-participant start validation.

   Multiplayer lobby milestone
3. **Phase 3 — Auction engine**
   - Player catalogue.
   - Auction settings.
   - Auction initialization.
   - Bid validation.
   - Bid increments.
   - Countdown logic.
   - Sold / unsold.
   - Purse and squad calculations.

   Core product milestone
4. **Phase 4 — Realtime multiplayer**
   - Supabase Realtime.
   - Live bidding events.
   - Player updates.
   - Team scoreboard updates.
   - Presence and connection indicators.
   - Reconnection and state synchronization.

   Live auction milestone
5. **Phase 5 — Auctioneer and voice**
   - Human auctioneer controls.
   - System auctioneer.
   - TTS announcements.
   - LiveKit integration.
   - Microphone and mute controls.
   - Voice reconnection.

   Immersive auction milestone
6. **Phase 6 — Results and history**
   - Final squad generation.
   - Purse reports.
   - Auction history.
   - Player statistics.
   - Results dashboard.

   Complete auction milestone
7. **Phase 7 — Public launch preparation**
   - Random matchmaking.
   - Admin dashboard.
   - Security review.
   - Performance testing.
   - Mobile responsiveness.
   - Production deployment.
   - Monitoring and backups.

   Launch milestone

## **26. Features to consider after the first release**

These are worthwhile, but I would avoid delaying the core product for them.

- Global player rankings.
- User profiles with auction statistics.
- Public tournaments.
- Private leagues between friend groups.
- Multiple auction formats.
- Retention and Right to Match (RTM) rules.
- Custom team names and branding.
- Spectator mode.
- Auction replay.
- Shareable auction results.
- Tournament points and championships.
- Custom player pools.
- Advanced analytics and franchise performance comparisons.

## **27. What we should not build initially**

To keep the project achievable, I would postpone:

- Native Android and iOS applications.
- Real-money bidding or gambling.
- Payments and wallet systems.
- Complex AI-powered player recommendations.
- Full cricket match simulation.
- Actual IPL franchise integration or official affiliation.
- Advanced social networking features.

AuctionArena should initially be an independent, browser-based mock auction platform.

# **28. Final scope checklist**

Here is the complete functional scope in one checklist.

**Requirements tracker**

# **0/42**

**Platform and accounts**

Landing page and dashboard

User registration and login

User profiles

Private rooms

Public rooms

Invite links and room codes

Random matchmaking

**Lobby and franchises**

10 IPL franchises

One owner per franchise

4-participant minimum

4–10 participants

Ready status

Host permissions

Room settings

Human or system auctioneer selection

**Auction**

Player database and profiles

Player queue and categories

Base prices and bid increments

Live bidding

Countdown timer

Sold and unsold

Human auctioneer controls

System auctioneer announcements

Purse validation

Squad validation

Overseas player restrictions

Accelerated auction support

**Realtime and communication**

Live bid broadcasting

Presence and connection status

Microphone and voice chat

Mute and push-to-talk

Auctioneer audio

Reconnect and state recovery

Chat and activity feed

**Results and operations**

Live franchise scoreboard

Squad management

Auction summaries

Auction history

Admin dashboard

Player CSV import

Security and permissions

Testing and production deployment

Reset checklist

# **29. Decisions still to finalize**

The product vision and core requirements are clear. A few business and gameplay decisions still need your approval before implementation.

**1. Auction rules**

Configurable IPL-style rules (recommended)

One fixed set of rules for every room

Fully custom rules for every room

**2. Auctioneer**

Both human and system auctioneer

System auctioneer only

Human auctioneer only

**3. User accounts**

Login required (recommended)

Guest joining with a display name

Both account and guest joining

**4. Spectators**

Add later

Include in the first release

**5. Joining after an auction starts**

Not allowed (recommended)

Allow spectator joining only

Allow joining an unoccupied franchise

**6. Device support**

Desktop-first, responsive mobile web (recommended)

Desktop-only initial release

Desktop and mobile equally prioritized

**7. Visual direction**

Cinematic stadium / IPL broadcast style

Modern esports / gaming style

Minimal professional sports dashboard

Confirm product decisions

## **My final recommendation**

Build AuctionArena as a **single Next.js + Supabase + LiveKit application**, with the auction engine as the central priority.

The most important thing is to get these five things right:

1. Friends can reliably join the same room.
2. Each participant controls exactly one franchise.
3. Bidding is fair, synchronized and server-authoritative.
4. Voice communication makes the auction feel social and alive.
5. The auction finishes with accurate squads, purse balances and results.

Everything else should build around those foundations.

The next practical step is to turn this specification into a development backlog with database migrations, API contracts, screen designs and test cases, then implement it phase by phase.