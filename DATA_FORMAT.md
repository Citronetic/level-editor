# Level Data Format Reference

## Source File Locations (in Unity Export)

```
UnityExport/ExportedProject/Assets/
  Resources/
    defaultlevels/           # 538 level JSON files
      t76-level-{1..299}.json   # Type 76 levels (primary)
      t64-level-{102..300+}.json # Type 64 levels (secondary)
      mockLevel.json             # Test/template level
    defaultconfigs/
      LevelsConfig.json          # Level metadata (index, difficulty, duration, seedId)
      ArenaLevelsConfig.json     # Arena-specific level configs
      GameEconomyModel.json      # Economy settings
      ContinuousLevelsConfigModel.json
      ObstacleIntroConfigModel.json
      ... (20+ other configs)
  Scripts/Assembly-CSharp/
    BlockColorType enum        # _AgentFixupStubs.cs
    BlockPieceKind enum        # Various shape types
    BlockObstacleKind enum     # Obstacle types
    DoorObstacleKind enum
    TileMap.cs, LevelState.cs  # Core level logic
  Resources/GamePrefabs/
    Blocks/BlockPiece-{1..28}.prefab  # Block piece prefabs
    Cells/                            # Cell prefabs
    Doors/                            # Door prefabs
  Sprite/    # 7200+ sprite assets
  Texture2D/ # 622 texture files
```

## LevelsConfig.json Structure

```json
{
  "levelConfigModels": [
    {
      "levelIndex": 1,        // Display order
      "isHard": false,
      "isSuperHard": false,
      "levelDuration": 180,   // seconds
      "seedId": "t76-level-1" // maps to file: defaultlevels/t76-level-1.json
    }
  ]
}
```

## Level JSON Structure (LM = Level Model)

```json
{
  "$type": "LM",
  "BMS":  [...],  // Block Models - colored block pieces on the board
  "DMS":  [...],  // Door Models - doors that open when blocks cleared
  "WMS":  [...],  // Wall Models - impassable boundary cells
  "CMS":  [...],  // Cell Models - playable grid cells
  "IWMS": [...],  // Inner Wall Models - walls between cells
  "GMS":  [...],  // Generator Models - spawn new blocks
  "EMS":  [...],  // Elevator Models - moving platforms with embedded blocks
  "CLMS": [...],  // Curtain Lock Models - locked regions
  "CCMS": [...],  // Connected Cell Models (mockLevel only)
  "CBMS": [...],  // Connected Block Models (mockLevel only)
  "GRM":  [...],  // Grinder Models (mockLevel only)
  "BSP":  [...]   // Board Start Position(s) - origin point(s) for rendering
}
```

## BlockColorType (BCT) Enum

| Value | Color     | Hex (editor) |
|-------|-----------|-------------|
| -1    | Black     | #333333     |
| 0     | Red       | #E74C3C     |
| 1     | Blue      | #3498DB     |
| 2     | Yellow    | #F1C40F     |
| 3     | Green     | #2ECC71     |
| 4     | Purple    | #9B59B6     |
| 5     | Orange    | #E67E22     |
| 6     | Pink      | #E91E90     |
| 7     | DarkBlue  | #2C3E80     |
| 8     | Turquoise | #1ABC9C     |
| 9     | DarkGreen | #27AE60     |

## Block Model (BM)

```json
{
  "$type": "BM",
  "BCT":  0,       // BlockColorType (color index)
  "BPMS": [...],   // Array of BPM positions (defines shape)
  "BIC":  0,       // Block Initial Count (pre-placed blocks count)
  "BAD":  0,       // Block Attack Direction (0=none, 1=horizontal, 2=vertical)
  "KID":  0,       // Key ID (for lock/key mechanics)
  "LID":  0,       // Layer ID
  "BHS":  false,   // Block Height Status (tall/short)
  "BD":   0,       // Block Damage
  "ILE":  false,   // Is Layer Explosive
  "LBCT": 0,       // Layer Block Color Type
  "AD":   0        // Arrow Direction (mockLevel variant)
}
```

## Door Model (DM)

```json
{
  "$type": "DM",
  "BCT":  0,       // Color of blocks that open this door
  "BPMS": [...],   // Positions the door occupies
  "IH":   true,    // Is Horizontal
  "BI":   1,       // Border Index (wall thickness)
  "DIC":  0,       // Door Initial Count (blocks needed to open)
  "TBD":  0,       // Turn Based Duration
  "DHS":  false    // Door Height Status
}
```

## Wall Model (WM)

```json
{
  "$type": "WM",
  "BPM": { "x": 2, "y": 11 },  // Single position
  "BI":  1                       // Border Index
}
```

## Cell Model (CM)

```json
{
  "$type": "CM",
  "BPM": { "x": 3, "y": 10 }   // Playable cell position
}
```

## Elevator Model (EM)

```json
{
  "$type": "EM",
  "BPMS": [...],    // Path positions for the elevator
  "EBMS": [...]     // Embedded Block Models (blocks on the elevator)
}
```

## Curtain Lock Model (CLM)

```json
{
  "$type": "CLM",
  "BPMS": [...],    // Positions covered by the curtain
  "CLC":  1         // Curtain Lock Count (hits to unlock)
}
```

## Connected Block Model (CBM, mockLevel only)

```json
{
  "$type": "CBM",
  "BPMS": [...],    // Connected positions
  "IIE":  false     // Is Initial Explosive
}
```

## Board Position Model (BPM)

```json
{
  "$type": "BPM",
  "x": 3,
  "y": 7
}
```

Grid coordinates. Origin varies per level (defined in BSP).
Typical range: x=0-10, y=0-15.

## BlockObstacleKind Enum

| Value | Type           |
|-------|----------------|
| 0     | None           |
| 1     | IceBlock       |
| 3     | ArrowBlock     |
| 4     | LockBlock      |
| 5     | StarBlock      |
| 6     | BombBlock      |
| 7     | LayerBlock     |
| 8     | DurationBlock  |
| 9     | ConnectedBlock |

## DoorObstacleKind Enum

| Value | Type          |
|-------|---------------|
| 0     | None          |
| 1     | IceDoor       |
| 2     | TurnBasedDoor |
| 3     | StarDoor      |
