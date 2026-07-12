// ============================================================
// FLOWER GAME — HOW TO PLAY GUIDE (Visual Edition)
// ============================================================

interface Props {
  onClose: () => void;
}

const FLOWER_GIFS: Record<string, string> = {
  blue: '/src/assets/flowers/blue-flower.gif',
  purple: '/src/assets/flowers/purple-flower.gif',
  red: '/src/assets/flowers/red-flower.gif',
  orange: '/src/assets/flowers/orange-flower.gif',
  yellow: '/src/assets/flowers/yellow-flower.gif',
  green: '/src/assets/flowers/green-flower.gif',
  black: '/src/assets/flowers/black-flower.gif',
  rainbow: '/src/assets/flowers/rainbow-flower.gif',
  triple_rainbow: '/src/assets/flowers/triple-rainbow-flower.gif',
  divine: '/src/assets/flowers/divine-flower.gif',
};

const POWER_GIFS: Record<string, string> = {
  wind: '/src/assets/powers/wind.gif',
  divine_protection: '/src/assets/powers/divine_protection.png',
  bug: '/src/assets/powers/bug.png',
  bee: '/src/assets/powers/bee.png',
  double_happiness: '/src/assets/powers/double_happiness.png',
  trade_present: '/src/assets/powers/trade_present.gif',
  trade_fate: '/src/assets/powers/trade_fate.gif',
  let_go: '/src/assets/powers/let_go.gif',
  spring: '/src/assets/powers/spring.gif',
  summer: '/src/assets/powers/summer.gif',
  autumn: '/src/assets/powers/autumn.png',
  winter: '/src/assets/powers/winter.gif',
  natural_disaster: '/src/assets/powers/natural_disaster.gif',
  eclipse: '/src/assets/powers/eclipse.png',
  great_reset: '/src/assets/powers/great_reset.png',
};

function PowerCard({ name, gif, label, blockable }: {
  name: string;
  gif: string;
  label: string;
  blockable: boolean;
}) {
  return (
    <div className="how-to-play-power">
      <img src={gif} alt={name} className="how-to-play-power__gif" draggable={false} />
      <div className="how-to-play-power__text">
        <div className="how-to-play-power__name">
          {name}
          <span className={`how-to-play-tag ${blockable ? 'how-to-play-tag--blockable' : 'how-to-play-tag--unstoppable'}`}>
            {blockable ? 'Blockable' : 'Unstoppable'}
          </span>
        </div>
        <div className="how-to-play-power__desc">{label}</div>
      </div>
    </div>
  );
}

export function HowToPlay({ onClose }: Props) {
  return (
    <div className="how-to-play-backdrop" onClick={onClose}>
      <div className="how-to-play-modal" onClick={e => e.stopPropagation()}>
        <div className="how-to-play-header">
          <h2 className="how-to-play-title">🌸 How to Play</h2>
          <button type="button" className="how-to-play-close" onClick={onClose}>×</button>
        </div>

        <div className="how-to-play-body">
          {/* Goal */}
          <section className="how-to-play-section">
            <h3>🏆 Goal — How to Win</h3>
            <p>To win, you need <b>ALL THREE</b> at the same time:</p>
            <div className="how-to-play-win-conditions">
              <div className="how-to-play-win-item">
                <span className="how-to-play-win-num">1</span>
                <span>3 Complete Sets in your garden</span>
              </div>
              <div className="how-to-play-win-item">
                <span className="how-to-play-win-num">2</span>
                <span>Empty hand — 0 cards left</span>
              </div>
              <div className="how-to-play-win-item">
                <span className="how-to-play-win-num">3</span>
                <span>NOT be God's Favourite</span>
              </div>
            </div>
            <div className="how-to-play-tip how-to-play-tip--warning">
              ⚠️ <b>God's Favourite blocks your win!</b> Even with 3 sets and no cards, you cannot win while you hold the crown.
            </div>
          </section>

          {/* Setup */}
          <section className="how-to-play-section">
            <h3>🌱 Setup</h3>
            <ul>
              <li><b>2–6 players</b> per match</li>
              <li>Everyone starts with <b>5 cards</b></li>
              <li>The deck has <b>121 cards</b>: 55 Flowers + 66 Powers</li>
              <li>Empty garden — build sets from scratch</li>
            </ul>
          </section>

          {/* Flower Cards */}
          <section className="how-to-play-section">
            <h3>🌺 Flower Cards</h3>
            <p>Plant these into your garden to build <b>Sets</b> — groups of matching-colour flowers.</p>

            <div className="how-to-play-flower-grid">
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.blue} alt="blue" draggable={false} />
                <span>Blue</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.purple} alt="purple" draggable={false} />
                <span>Purple</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.red} alt="red" draggable={false} />
                <span>Red</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.orange} alt="orange" draggable={false} />
                <span>Orange</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.yellow} alt="yellow" draggable={false} />
                <span>Yellow</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.green} alt="green" draggable={false} />
                <span>Green</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.black} alt="black" draggable={false} />
                <span>Black</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.rainbow} alt="rainbow" draggable={false} />
                <span>Rainbow</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.triple_rainbow} alt="triple rainbow" draggable={false} />
                <span>Triple Rainbow</span>
              </div>
              <div className="how-to-play-flower">
                <img src={FLOWER_GIFS.divine} alt="divine" draggable={false} />
                <span>Divine</span>
              </div>
            </div>

            <div className="how-to-play-tip">
              <b>Set Types:</b><br />
              🟢 <b>Complete</b> = 3+ matching flowers (counts toward your 3 needed to win)<br />
              🔵 <b>Solid</b> = 5+ flowers, or contains Triple Rainbow (harder to destroy)<br />
              🟣 <b>Divine</b> = contains Divine flower or Token (completely unbreakable)
            </div>
          </section>

          {/* Token */}
          <section className="how-to-play-section">
            <h3>🔮 The Token</h3>
            <p>
              If you have <b>one flower of each of the 7 normal colours</b> spread across your garden sets,
              those 7 flowers transform into a <b>Divine Token</b> — an unbreakable Complete Set!
            </p>
            <p>The original 7 flowers go to the discard pile. Hard to pull off, but incredibly powerful.</p>
          </section>

          {/* Power Cards */}
          <section className="how-to-play-section">
            <h3>⚡ Power Cards</h3>
            <p>Play these to attack, defend, or manipulate the game.</p>

            <div className="how-to-play-powers">
              <PowerCard name="Wind" gif={POWER_GIFS.wind} blockable={true} label="Steal a flower from an opponent's set and add it to yours." />
              <PowerCard name="Divine Protection" gif={POWER_GIFS.divine_protection} blockable={false} label="Block any Blockable power card played against you." />
              <PowerCard name="Bug" gif={POWER_GIFS.bug} blockable={true} label="Destroy 2 flowers from an opponent's set." />
              <PowerCard name="Bee" gif={POWER_GIFS.bee} blockable={false} label="Discard one flower from your hand to plant a new flower of any colour." />
              <PowerCard name="Double Happiness" gif={POWER_GIFS.double_happiness} blockable={true} label="Take 2 cards from an opponent's hand, then give them 2 of yours. Great for emptying your hand!" />
              <PowerCard name="Trade Present" gif={POWER_GIFS.trade_present} blockable={true} label="Secretly trade one card with an opponent. Both players pick a card to swap." />
              <PowerCard name="Trade Fate" gif={POWER_GIFS.trade_fate} blockable={true} label="Swap your entire hand with an opponent's hand." />
              <PowerCard name="Let Go" gif={POWER_GIFS.let_go} blockable={false} label="Discard a card and draw a new one. Simple way to cycle bad cards." />
              <PowerCard name="Natural Disaster" gif={POWER_GIFS.natural_disaster} blockable={true} label="Destroy an opponent's entire incomplete set (less than 3 flowers)." />
              <PowerCard name="Eclipse" gif={POWER_GIFS.eclipse} blockable={false} label="Everyone discards their hand and draws 5 new cards." />
              <PowerCard name="Great Reset" gif={POWER_GIFS.great_reset} blockable={false} label="ALL gardens are completely wiped. Everyone keeps their hand." />
            </div>

            <div className="how-to-play-seasons-row">
              <div className="how-to-play-season">
                <img src={POWER_GIFS.spring} alt="spring" draggable={false} />
                <b>Spring</b>
                <span>Planting doesn't count as a move!</span>
              </div>
              <div className="how-to-play-season">
                <img src={POWER_GIFS.summer} alt="summer" draggable={false} />
                <b>Summer</b>
                <span>Normal rules apply</span>
              </div>
              <div className="how-to-play-season">
                <img src={POWER_GIFS.autumn} alt="autumn" draggable={false} />
                <b>Autumn</b>
                <span>Can discard flowers from hand</span>
              </div>
              <div className="how-to-play-season">
                <img src={POWER_GIFS.winter} alt="winter" draggable={false} />
                <b>Winter</b>
                <span>Only 1 move. Blessing blocked.</span>
              </div>
            </div>

            <div className="how-to-play-tip">
              <b>Blockable</b> powers can be stopped by the target with <b>Divine Protection</b> or <b>Wind</b>.<br />
              <b>Unstoppable</b> powers cannot be blocked — the target must take the hit.
            </div>
          </section>

          {/* Turn */}
          <section className="how-to-play-section">
            <h3>🔄 Your Turn</h3>
            <ol>
              <li>
                <b>Blessing</b> — Flip a coin!<br />
                🎲 <b>Tails</b> → Normal draw phase.<br />
                🎲 <b>Heads</b> → Reveal top 7 cards. Pick 2 to keep. Arrange the rest back on top.<br />
                <span className="how-to-play-note">Winter blocks Blessing entirely. But if you have 0 cards in Winter, you still draw 7.</span>
              </li>
              <li>
                <b>Draw Phase</b> — Draw <b>2 cards</b>, or <b>Pass</b> to skip.<br />
                If the draw pile has 9 or fewer cards, the discard pile is shuffled back in.
              </li>
              <li>
                <b>Action Phase</b> — Play up to your move limit:
                <ul>
                  <li>🟢 <b>Normal / Summer:</b> <b>3 moves</b></li>
                  <li>❄️ <b>Winter:</b> Only <b>1 move</b></li>
                  <li>🌸 <b>Spring bonus:</b> Planting flowers does <b>NOT</b> count as a move!</li>
                </ul>
              </li>
            </ol>
            <div className="how-to-play-tip">
              ⏱️ You have <b>60 seconds</b> per turn. Time runs out? You auto-Pass.
            </div>
          </section>

          {/* Counter */}
          <section className="how-to-play-section">
            <h3>🛡️ Counter Window</h3>
            <p>When someone hits you with a <b>Blockable</b> power, you get a chance to fight back!</p>
            <ul>
              <li>You have <b>14 seconds</b> to respond</li>
              <li>Play <b>Divine Protection</b> — completely blocks the attack</li>
              <li>Play <b>Wind</b> — steals the attack and sends it back</li>
              <li>Or <b>Allow</b> it — take the hit if you can't stop it</li>
            </ul>
            <div className="how-to-play-tip">
              ⏱️ No response in 14 seconds? The attack goes through automatically.
            </div>
          </section>

          {/* God's Favourite */}
          <section className="how-to-play-section">
            <h3>👑 God's Favourite</h3>
            <p>
              <b>God's Favourite</b> is a special status that moves between players.
              It passes to whoever most recently <b>completed or extended a set</b> by planting a flower.
            </p>
            <ul>
              <li>❌ <b>You CANNOT win while you are God's Favourite</b></li>
              <li>✅ <b>Consolation:</b> You get to see and arrange 7 cards from the draw pile</li>
              <li>The status transfers whenever someone else completes a set</li>
            </ul>
            <div className="how-to-play-tip how-to-play-tip--warning">
              💡 Strategy: Try to give God's Favourite to someone else before you go for the win! Plant a flower to complete a set on purpose — you'll steal the status from whoever had it.
            </div>
          </section>

          {/* Discarding */}
          <section className="how-to-play-section">
            <h3>🤲 Emptying Your Hand</h3>
            <p>To win you need <b>0 cards</b>. Ways to get rid of them:</p>
            <ul>
              <li><b>Plant</b> a flower — removes 1 card from hand</li>
              <li><b>Use a Power</b> — most powers consume the card</li>
              <li><b>Let Go</b> — discard 1, draw 1 (cycles bad cards)</li>
              <li><b>Double Happiness</b> — give 2 cards to an opponent</li>
              <li><b>Autumn season</b> — special ability to discard flowers from hand</li>
            </ul>
            <div className="how-to-play-tip">
              💡 <b>Two schools of thought:</b><br />
              <b>Small Hand:</b> Keep few cards, play conservatively. Easier to empty for the win.<br />
              <b>Big Hand:</b> Plant flowers for <b>opponents</b> on purpose — draws more cards, increasing chance of finding <b>Let Go</b>.
            </div>
          </section>

          {/* Tips */}
          <section className="how-to-play-section">
            <h3>💡 Pro Tips</h3>
            <ul>
              <li>Build <b>Solid Sets</b> (5+ flowers or Triple Rainbow) — much harder to destroy</li>
              <li>Save <b>Divine Protection</b> for critical moments — you only get a few</li>
              <li>Planting on <b>opponents</b> can mess up their set colours and give you more draws</li>
              <li>Watch the draw pile — when it gets low, the game is about to end</li>
              <li>Rainbow flowers are super flexible — use them to complete almost any set</li>
              <li>In <b>Spring</b>, plant as much as you can — it's free!</li>
              <li>In <b>Winter</b>, plan your single move carefully</li>
              <li>Don't forget: you need to <b>not be God's Favourite</b> to win!</li>
            </ul>
          </section>
        </div>

        <div className="how-to-play-footer">
          <button type="button" className="how-to-play-done" onClick={onClose}>
            Got it! 🌸
          </button>
        </div>
      </div>
    </div>
  );
}
