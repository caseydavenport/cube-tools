// Picks the name and description the cube home's header shows.

// standIn names a cube by its id, without the "cc:" prefix CubeCobra cubes have.
function standIn(cube) {
  return { id: cube, name: cube.replace(/^cc:/, "") }
}

// cubeMeta finds a cube's entry (name, description) in the /api/cubes list.
// CubeCobra cubes aren't listed, and a failed list has no entries, so both get
// a stand-in named by the cube's id. Returns undefined while the list loads.
export function cubeMeta(cubesResponse, error, cube) {
  if (error) {
    return standIn(cube)
  }
  if (!cubesResponse) {
    return undefined
  }

  const listed = (cubesResponse.cubes || []).find(c => c.id === cube)
  if (listed) {
    return listed
  }
  return standIn(cube)
}
