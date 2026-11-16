import { z } from "zod";

export const uuid = z.uuid();
export const roomCode = z.string().trim().min(4).max(8);
export const franchiseId = z.enum(["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"]);

export const incrementBand = z.object({
  upto: z.number().int().positive().nullable(),
  step: z.number().int().positive().max(1000),
});

export const settingsPatch = z
  .object({
    purse_lakh: z.number().int().min(1000).max(50000),
    squad_max: z.number().int().min(5).max(30),
    squad_min: z.number().int().min(1).max(30),
    overseas_max: z.number().int().min(0).max(30),
    bid_timer_sec: z.number().int().min(5).max(120),
    format: z.enum(["standard", "accelerated", "custom"]),
    increments: z.array(incrementBand).min(1).max(8),
    retention_mode: z.enum(["none", "season"]),
    inactive_retained_in_pool: z.boolean(),
    unsold_reround: z.boolean(),
    pool_limit: z.number().int().min(20).max(1000).nullable(),
  })
  .partial();

export const createRoom = z.object({
  name: z.string().trim().min(1, "Give the room a name.").max(60),
  visibility: z.enum(["public", "private"]).default("private"),
  max_participants: z.number().int().min(4).max(10).default(10),
  auctioneer_type: z.enum(["system", "human"]).default("system"),
  password: z.string().max(64).optional(),
  description: z.string().max(280).optional(),
  settings: settingsPatch.optional(),
});

export const joinRoom = z.object({
  code: roomCode,
  password: z.string().max(64).optional(),
  invite_token: z.string().max(80).optional(),
});

export const roomOnly = z.object({ room_id: uuid });

export const updateRoom = z.object({
  room_id: uuid,
  patch: z
    .object({
      name: z.string().trim().min(1).max(60),
      description: z.string().max(280).nullable(),
      visibility: z.enum(["public", "private"]),
      max_participants: z.number().int().min(4).max(10),
      password: z.string().max(64).nullable(),
      settings: settingsPatch,
    })
    .partial(),
});

export const placeBid = z.object({
  room_id: uuid,
  lot_id: uuid,
  amount_lakh: z.number().int().positive(),
  idempotency_key: z.string().min(8).max(80),
});

export const auctioneerAction = z.object({
  room_id: uuid,
  action: z.enum(["skip", "start_countdown", "stop_countdown", "undo_bid", "end_auction"]),
  seconds: z.number().int().min(3).max(120).optional(),
});

export const playerRow = z.object({
  name: z.string().trim().min(2).max(80),
  team: z.string().trim().max(5).optional().default(""),
  country: z.string().trim().min(2).max(40),
  role: z.string().trim().min(2).max(14),
  capped: z.string().trim().max(5).optional().default("Y"),
  base_lakh: z.coerce.number().int().min(1).max(5000),
  marquee: z.string().trim().max(5).optional().default(""),
  bowling: z.string().trim().max(40).optional().default(""),
  batting: z.string().trim().max(40).optional().default(""),
  retained: z.string().trim().max(5).optional().default(""),
  retention_lakh: z.string().trim().max(8).optional().default(""),
  last_price_lakh: z.string().trim().max(8).optional().default(""),
  photo_url: z.string().trim().max(400).optional().default(""),
});
