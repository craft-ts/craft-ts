insertSelect : l'allié méconnu de vos logiques d'état complexes

Quand on manipule du state complexe dans Angular, on se retrouve souvent face à un dilemme :

▸ Créer des états dérivés pour chaque sous-partie ?
▸ Ou tout gérer dans un seul state monolithique ?

Les deux approches ont des inconvénients :
• États dérivés multiples → risques de désynchronisation et complexité de persistance
• State unique → logique difficile à organiser et à maintenir

𝗶𝗻𝘀𝗲𝗿𝘁𝗦𝗲𝗹𝗲𝗰𝘁 résout ce problème élégamment ✨

Cette fonction d'insertion permet de cibler une partie précise du state et d'y ajouter des méthodes et computed spécifiques, sans fragmenter votre état.

Regardez cet exemple concret avec insertSelect imbriqué :

```typescript
// Structure du state
const initialState = {
  cellsData: [
    { index: 0, color: '#f8fafc', paintCount: 0 },
    { index: 1, color: '#f8fafc', paintCount: 0 },
    // ... 254 autres cellules
  ],
  ui: { activeColor: '#0f172a' },
};

// State avec insertSelect imbriqué
const board = state(
  initialState,
  // Niveau 1 : sélection dans cellsData
  insertSelect(
    'cellsData',
    () => ({}),
    // Niveau 2 : sélection d'une cellule
    insertSelect('cell', ({ state, update, parent }) => ({
      paint: () =>
        update((cell) => ({
          ...cell,
          color:
            cell.color === parent().ui.activeColor
              ? '#f8fafc'
              : parent().ui.activeColor,
          paintCount: cell.paintCount + 1,
        })),
      paintCountStr: computed(() => `Painted ${state().paintCount} times`),
    })),
  ),
  ({ state, update }) => ({
    setActiveColor: (color: string) =>
      update((s) => ({
        ...s,
        ui: { ...s.ui, activeColor: color },
      })),
    paintedCount: computed(
      () => state().cellsData.filter((c) => c.color !== '#f8fafc').length,
    ),
  }),
);

// Utilisation
board.selectCellsData().selectCell(5).paint();
board.selectCellsData().selectCell(5).paintCountStr();
board.paintedCount(); // 42
```

𝗟𝗲𝘀 𝗮𝘃𝗮𝗻𝘁𝗮𝗴𝗲𝘀 :

✅ Une seule source de vérité
✅ Logique organisée par niveau de responsabilité
✅ Pas de désynchronisation possible
✅ Persistance simplifiée (un seul state à sauvegarder)
✅ Type-safety totale
✅ Composition infinie (on peut imbriquer les insertSelect)

C'est vraiment une pièce maîtresse pour gérer des états complexes avec élégance 🎯

—

𝗣𝗿𝗼𝗰𝗵𝗮𝗶𝗻𝗲𝘀 é𝘁𝗮𝗽𝗲𝘀 :

Je finalise actuellement un mécanisme pour rendre les exceptions type-safe et inférer automatiquement les différentes parties du state.

Pouvoir piloter de la logique complexe + gérer des erreurs type-safe m'a fait réaliser quelque chose...

Je peux probablement résoudre les problématiques liées aux formulaires ! 🎨

Une fois la gestion des exceptions terminée, je vais m'attaquer à la génération de fields (formField) comme le fait le nouveau Signal Form d'Angular.

J'ai déjà quelques idées basées sur la composition qui, je pense, seront essentielles pour gérer les formulaires les plus complexes.

À suivre... 👀

—

📚 Documentation complète : https://ng-angular-stack.github.io/craft/

—

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
