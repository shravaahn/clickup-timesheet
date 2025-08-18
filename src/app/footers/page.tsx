import React from "react";

// Props accept your computeTotalsWeek result + fmt utility
interface FooterTotalsWeekProps {
  computeTotalsWeek: () => {
    dailyEst: number[];
    dailyTrk: number[];
  };
  fmt: (n: number) => string;
}

const FooterTotalsWeek: React.FC<FooterTotalsWeekProps> = ({ computeTotalsWeek, fmt }) => {
  const { dailyEst, dailyTrk } = computeTotalsWeek();
  const grandEst = dailyEst.reduce((a, b) => a + b, 0);
  const grandTrk = dailyTrk.reduce((a, b) => a + b, 0);

  return (
    <tfoot>
      <tr>
        <td className="proj-cell">All Projects Total</td>
        {dailyEst.map((estVal, d) => (
          <td key={d}>
            <div className="cellBox">
              <input
                className="num locked"
                disabled
                value={fmt(estVal)}
                readOnly
              />
              <input
                className="num"
                disabled
                value={fmt(dailyTrk[d])}
                readOnly
              />
            </div>
          </td>
        ))}
        <td>
          <div className="cellBox">
            <input
              className="num locked"
              disabled
              value={fmt(grandEst)}
              readOnly
            />
            <input
              className="num"
              disabled
              value={fmt(grandTrk)}
              readOnly
            />
          </div>
        </td>
      </tr>
    </tfoot>
  );
};

export default FooterTotalsWeek;