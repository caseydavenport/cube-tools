// Returns the average CMC of of cards in the deck,
// excluding basic lands.
export function AverageCMC({deck}) {
  if (!deck || !deck.mainboard) {
    return 0;
  }
  let i = 0
  let t = 0
  let c = 0
  while (i < deck.mainboard.length) {
    i++
    // Skip basic lands.
    let card = deck.mainboard[i]
    if (card && !card.types.includes("Land")) {
      t += card.cmc
      c++
    }
  }
  return Math.round(t / c * 100) / 100
}

// Returns the colors that make up this deck. We use a couple of measures to determine this.
// - Looking at the basic lands within the deck to determine which colors are being run.
// - Counting the number of cards of a certain color (excluding hybrids).
export function ExtractColors({deck}) {
  if (!deck || !deck.mainboard) {
    return null;
  }
  if (deck.colors) {
    // Decks can override auto-detection by specifying
    // colors explicitly. This is useful if, for example, they only
    // have a single hybrid card and we don't want this deck to count towards that
    // card's colors.
    return deck.colors
  }

  // Check individual card colors.

  // Calculate the colors based on the card list.
  let i = 0
  let colors = new Map()
  while (i < deck.mainboard.length) {
    i++
    let card = deck.mainboard[i];
    if (card && IsBasicLand(card)) {
      // Use the basic land types to determine what colors this deck is.
      // This is generally more accurate than basing it off of cards, because oftentimes
      // hybrid cards incorrectly lead the code into thinking a two-color deck is actually three-color.
      switch (card.name) {
        case "Forest":
          colors.set("G", true);
          break;
        case "Swamp":
          colors.set("B", true);
          break;
        case "Island":
          colors.set("U", true);
          break;
        case "Plains":
          colors.set("W", true);
          break;
        case "Mountain":
          colors.set("R", true);
          break;
        default:
          console.log("Unexpected basic land: " + card.name)
      }
    } else if (card && !IsBasicLand(card)) {
      // Skip hybrid cards, as we can't determine if the deck is running one color, the other, or both.
      if (card.colors == null || card.mana_cost.includes("/")) {
        continue
      }

      // Otherwise, include all the card's colors.
      for (let i in card.colors) {
        colors.set(card.colors[i], true)
      }
    }
  }
  return Array.from(colors.keys());
}

// StdDev takes a list of numbers and returns the standard deviation of that set.
export function StdDev(data) {
  // Find the average value.
  let sum = 0;
  for (let val of data) {
    sum += val;
  }
  let avg = sum / data.length;

  // Find
  let sumOfSquares = 0
  for (let val of data) {
    let diff = avg - val
    sumOfSquares += diff*diff
  }
  return Math.round(Math.sqrt(sumOfSquares / data.length)*10) / 10
}

// Returns true if the card is a basic land, and false otherwise.
export function IsBasicLand(card) {
  if (card.types && card.types.includes("Basic")) {
    return true
  }
  return false
}

export function SortFunc(a, b) {
  if (a.props.sort > b.props.sort) {
    return -1
  } else if (a.props.sort < b.props.sort) {
    return 1
  }
  return 0
}

export function StringToColor(str) {
  // Use some hard-coded color values for known color pairings.
  switch (str) {
    case "WU":
      return "#03fcf8"
      break;
    case "WB":
      return "#FFFFFF"
      break;
    case "WR":
      return "#ff7a7a"
      break;
    case "WG":
      return "#e0ff7a"
      break;
    case "UB":
      return "#4e5591"
      break;
    case "UR":
      return "#fa2de9"
      break;
    case "BR":
      return "#8a0404"
      break;
    case "BG":
      return "#114a19"
      break;
    case "RG":
      return "#8a560a"
      break;
    case "UG":
      return "#61d491"
      break;
  }

  // Not a known string - auto-generate one.
  // If this is a short string, duplicate it for additional color space.
  // Otherwise, we get very similar shades of red.
  if (str.length < 3) {
    str += str + str
  }
  let hash = 0;
  str.split('').forEach(char => {
    hash = char.charCodeAt(0) + ((hash << 5) - hash)
  })
  let color = '#'
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff
    color += value.toString(16).padStart(2, '0')
  }
  return color
}

export function CheckboxesToColors(checkboxes) {
  let colors = []
  if (checkboxes[0]) colors.push("W")
  if (checkboxes[1]) colors.push("U")
  if (checkboxes[2]) colors.push("B")
  if (checkboxes[3]) colors.push("R")
  if (checkboxes[4]) colors.push("G")
  return colors
}
