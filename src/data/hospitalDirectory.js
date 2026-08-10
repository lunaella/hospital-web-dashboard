// Reference directory for the "Add Hospital" form in Settings > Hospital
// Network — picking a city narrows Hospital Name down to real hospitals
// actually located there, instead of a free-text field an admin has to
// type correctly from scratch (and possibly misspell/duplicate).
//
// Only Lucena City is populated for now, matching where this project's
// actual partner (Philippine Red Cross Lucena Chapter) operates. Add more
// cities/hospitals here as the network expands — nothing else in the form
// needs to change, it just reads whatever cities exist as keys below.
//
// Names/addresses are real hospitals in Lucena City, Quezon, current as of
// this writing; codes are short slugs made up for this app (not each
// hospital's own internal code) and can be edited freely in the form.
export const HOSPITAL_DIRECTORY = {
  "Lucena City": [
    {
      name: "Lucena MMG General Hospital",
      code: "MMG-LC",
      address: "Maharlika Highway, Brgy. Ibabang Dupay, Lucena City",
    },
    {
      name: "Quezon Medical Center",
      code: "QMC-LC",
      address: "Quezon Avenue, Lucena City",
    },
    {
      name: "St. Anne General Hospital",
      code: "SAGH-LC",
      address: "P. Gomez Extension, Brgy. Ibabang Dupay, Lucena City",
    },
    {
      name: "Hospital de la Sagrada Familia",
      code: "HSF-LC",
      address: "San Fernando St. corner C.M. Recto St., Lucena City",
    },
    {
      name: "Lucena United Doctors Hospital and Medical Center",
      code: "LUDH-LC",
      address: "Maharlika Highway, Brgy. Isabang, Lucena City",
    },
  ],
};

export const DIRECTORY_CITIES = Object.keys(HOSPITAL_DIRECTORY);

export function hospitalsForCity(city) {
  return HOSPITAL_DIRECTORY[city] ?? [];
}
