export function SimulatorArt({
  type,
}: {
  type: "skills" | "moment" | "hof" | "event";
}) {
  return (
    <svg
      className={`sim-art art-${type}`}
      viewBox="0 0 340 190"
      fill="none"
      role="img"
      aria-label={
        {
          skills: "세 장의 스킬 카드와 변경권",
          moment: "뒤집힌 후보 카드와 모먼트 카드",
          hof: "명예의 전당 선수 카드와 기념 받침대",
          event: "다섯 번의 도전을 위한 이벤트 응모권",
        }[type]
      }
    >
      <ellipse
        cx="175"
        cy="169"
        rx="121"
        ry="10"
        fill="#0c1628"
        opacity=".15"
      />
      {type === "skills" ? (
        <>
          <g transform="translate(58 37) rotate(-13 46 60)">
            <rect
              width="83"
              height="117"
              rx="8"
              fill="#2f486d"
              stroke="#6887b7"
            />
            <path d="M12 15H70M12 101H50" stroke="#90accf" />
            <text
              x="42"
              y="72"
              textAnchor="middle"
              fill="#d1dced"
              fontSize="38"
              fontFamily="Georgia"
            >
              S
            </text>
          </g>
          <g transform="translate(133 19) rotate(4 46 60)">
            <rect
              width="88"
              height="131"
              rx="8"
              fill="#e7c98a"
              stroke="#f9e6bb"
              strokeWidth="2"
            />
            <rect x="8" y="8" width="72" height="115" rx="5" stroke="#b28c42" />
            <text
              x="44"
              y="78"
              textAnchor="middle"
              fill="#775729"
              fontSize="52"
              fontFamily="Georgia"
            >
              S
            </text>
            <path d="M24 104H64" stroke="#ae893f" />
          </g>
          <g transform="translate(220 57) rotate(15 35 45)">
            <rect width="64" height="91" rx="6" fill="#c2d2e8" />
            <text
              x="32"
              y="55"
              textAnchor="middle"
              fill="#344b72"
              fontSize="31"
              fontFamily="Georgia"
            >
              S
            </text>
          </g>
          <path
            d="M52 133Q31 78 64 48M53 45L67 45L65 59"
            stroke="#bda36f"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : type === "moment" ? (
        <>
          <g transform="translate(44 51) rotate(-18 45 55)">
            <rect
              width="79"
              height="107"
              rx="7"
              fill="#344b69"
              stroke="#8ba4c8"
            />
            <path d="M10 12H69V95H10Z" stroke="#708eb2" />
            <path d="M20 66L39 35L59 66L39 82Z" fill="#869dbd" />
          </g>
          <g transform="translate(117 29) rotate(-3 45 55)">
            <rect
              width="88"
              height="124"
              rx="8"
              fill="#233b60"
              stroke="#c4a260"
              strokeWidth="2"
            />
            <path d="M10 12H78V112H10Z" stroke="#af965e" />
            <path d="M23 76L44 42L65 76L44 94Z" fill="#dfc88d" />
          </g>
          <g transform="translate(204 36) rotate(13 45 55)">
            <rect
              width="86"
              height="121"
              rx="8"
              fill="#cfbe9a"
              stroke="#f8df9a"
              strokeWidth="2"
            />
            <path d="M10 12H76V109H10Z" stroke="#92754f" />
            <text
              x="43"
              y="73"
              textAnchor="middle"
              fill="#554b38"
              fontSize="43"
              fontFamily="Georgia"
            >
              M
            </text>
            <path d="M26 89H60" stroke="#92754f" />
          </g>
        </>
      ) : type === "hof" ? (
        <>
          <path d="M75 150H270L285 170H60Z" fill="#365074" />
          <rect x="84" y="139" width="178" height="13" rx="3" fill="#8d7552" />
          <rect
            x="113"
            y="18"
            width="119"
            height="124"
            rx="9"
            fill="#dac091"
            stroke="#f6dfad"
            strokeWidth="3"
          />
          <path d="M124 31H221V129H124Z" stroke="#a68550" />
          <circle cx="173" cy="59" r="15" fill="#a88b5e" />
          <path
            d="M146 102V92Q150 77 173 77Q196 77 200 92V102Z"
            fill="#a88b5e"
          />
          <text
            x="173"
            y="121"
            textAnchor="middle"
            fill="#695033"
            fontSize="13"
            fontFamily="Georgia"
            letterSpacing="4"
          >
            HOF
          </text>
          <path
            d="M98 122Q56 91 92 53M93 108L73 100M88 91L68 78M89 73L77 55M246 122Q288 91 252 53M251 108L271 100M256 91L276 78M255 73L267 55"
            stroke="#bfa674"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <g transform="translate(72 35) rotate(-9 100 60)">
          <path
            d="M8 0H196Q204 0 204 8V40Q183 51 204 62V112Q204 120 196 120H8Q0 120 0 112V62Q21 51 0 40V8Q0 0 8 0Z"
            fill="#d8bd87"
          />
          <path d="M140 10V110" stroke="#8e744b" strokeDasharray="4 5" />
          <text
            x="73"
            y="78"
            textAnchor="middle"
            fill="#71562d"
            fontSize="60"
            fontFamily="Georgia"
          >
            5
          </text>
          <text
            x="73"
            y="98"
            textAnchor="middle"
            fill="#71562d"
            fontSize="8"
            letterSpacing="2"
          >
            CHANCES
          </text>
          <path
            d="M157 25H185M157 31H185M157 38H185M157 49H185M157 56H185M157 64H185M157 76H185M157 82H185M157 94H185"
            stroke="#8e744b"
          />
        </g>
      )}
    </svg>
  );
}
