import { commonMessages } from "./common";
import { learnMessages } from "./learn";
import { navMessages } from "./nav";
import { profileMessages } from "./profile";
import { quizCatalogMessages } from "./quizCatalog";
import { quizPlayMessages } from "./quizPlay";
import { trialMessages } from "./trial";

/** All student-facing strings. A test checks that no key is defined twice across the tables. */
export const messageTables = [commonMessages, learnMessages, navMessages, profileMessages, quizCatalogMessages, quizPlayMessages, trialMessages] as const;

export const messages = {
  ...commonMessages,
  ...learnMessages,
  ...navMessages,
  ...profileMessages,
  ...quizCatalogMessages,
  ...quizPlayMessages,
  ...trialMessages,
};

export type MessageKey = keyof typeof messages;
