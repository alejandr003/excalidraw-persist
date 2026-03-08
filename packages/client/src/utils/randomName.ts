const ADJECTIVES = [
  'Purple', 'Cyan', 'Amber', 'Coral', 'Teal',
  'Indigo', 'Crimson', 'Jade', 'Violet', 'Scarlet',
  'Azure', 'Fuchsia', 'Olive', 'Cobalt', 'Magenta',
  'Ochre', 'Cerulean', 'Sienna', 'Vermilion', 'Chartreuse',
];

const ANIMALS = [
  'Tiger', 'Panda', 'Fox', 'Wolf', 'Hawk',
  'Dolphin', 'Penguin', 'Jaguar', 'Lynx', 'Falcon',
  'Otter', 'Meerkat', 'Capybara', 'Axolotl', 'Quokka',
  'Narwhal', 'Platypus', 'Chameleon', 'Pangolin', 'Firefly',
];

const STORAGE_KEY = 'excalidraw-user-name';

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

export function getOrCreateUserName(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const name = generateRandomName();
  localStorage.setItem(STORAGE_KEY, name);
  return name;
}

/** Persist a custom name. If blank, generates a new random name instead. */
export function setUserName(name: string): string {
  const trimmed = name.trim();
  const final = trimmed || generateRandomName();
  localStorage.setItem(STORAGE_KEY, final);
  return final;
}

